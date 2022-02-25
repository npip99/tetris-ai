import * as tf from '@tensorflow/tfjs-node-gpu';
import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';

class NN {
    model: tf.LayersModel;

    constructor(input_tensor: number[][][], output_actions: number) {
        // Topology parameters
        const numFilters = 64; // 256
        const numBlocks = 10; // 40
        const numSEChannels = 32;

        // HyperParameters
        const l2_parameter = 1e-4;
        const learningRate = 1e-2;
        const momentum = 0.9;

        // Input
        const input = tf.input({
            shape: [input_tensor.length, input_tensor[0].length, input_tensor[0][0].length],
        });

        // Parameters of conv blocks used in the main network
        const conv3x3_params = {
            kernelSize: [3, 3],
            filters: numFilters,
            padding: 'same' as any, // Weird tfjs bug?
            kernelRegularizer: tf.regularizers.l2({l2: l2_parameter}),
        };

        // The first Conv block
        let mainNetwork = tf.layers.conv2d(conv3x3_params).apply(input);
        mainNetwork = tf.layers.batchNormalization().apply(mainNetwork);
        mainNetwork = tf.layers.reLU().apply(mainNetwork);

        // Create a tower of resblocks
        for(let i = 0; i < numBlocks; i++) {
            // A single resBlock
            let createResLayer = (inp: any) => {
                // Conv layer 1
                let residualLayer = tf.layers.conv2d(conv3x3_params).apply(inp);
                residualLayer = tf.layers.batchNormalization().apply(residualLayer);
                residualLayer = tf.layers.reLU().apply(residualLayer);

                // Conv layer 2
                residualLayer = tf.layers.conv2d(conv3x3_params).apply(residualLayer);
                residualLayer = tf.layers.batchNormalization().apply(residualLayer);

                // Combine
                residualLayer = tf.layers.add().apply([inp, residualLayer]);
                residualLayer = tf.layers.reLU().apply(residualLayer);

                return residualLayer;
            };

            // Apply a resblock
            mainNetwork = createResLayer(mainNetwork);
        }

        // Create the value head, ending in tanh,
        // which will estimate the value of the position
        let createValueHead = (inp: any) => {
            let valueHead = inp;
            // Value Head Layers
            valueHead = tf.layers.conv2d({
                kernelSize: [1, 1],
                // https://medium.com/oracledevs/lessons-from-alpha-zero-part-5-performance-optimization-664b38dc509e
                filters: 32,
                kernelRegularizer: tf.regularizers.l2({l2: l2_parameter}),
            }).apply(valueHead);
            valueHead = tf.layers.batchNormalization().apply(valueHead);
            valueHead = tf.layers.reLU().apply(valueHead);
            valueHead = tf.layers.flatten().apply(valueHead);
            valueHead = tf.layers.dense({
                units: 256,
                useBias: true,
                kernelRegularizer: tf.regularizers.l2({l2: l2_parameter}),
            }).apply(valueHead);
            valueHead = tf.layers.reLU().apply(valueHead);
            valueHead = tf.layers.dense({
                units: 1,
                useBias: true,
                activation: 'sigmoid',
                kernelRegularizer: tf.regularizers.l2({l2: l2_parameter}),
            }).apply(valueHead);
    
            return valueHead;
        };

        // Create the policy head, which gives the logits for various moves
        let createPolicyHead = (inp: any) => {
            let policyHead = inp;
            // Policy Head Layers

            /*
            // Better policyHead
            // https://github.com/LeelaChessZero/lc0/pull/712
            policyHead = tf.layers.conv2d({
                kernelSize: [3, 3],
                filters: numFilters,
                kernelRegularizer: tf.regularizers.l2({l2: l2_parameter}),
            }).apply(policyHead);
            policyHead = tf.layers.batchNormalization().apply(policyHead);
            policyHead = tf.layers.reLU().apply(policyHead);

            policyHead = tf.layers.conv2d({
                kernelSize: [3, 3],
                filters: numFilters,
                kernelRegularizer: tf.regularizers.l2({l2: l2_parameter}),
            }).apply(policyHead);
            policyHead = tf.layers.batchNormalization().apply(policyHead);
            policyHead = tf.layers.reLU().apply(policyHead);
            policyHead = tf.layers.reshape({
                targetShape: [output_num_actions],
            }).apply(policyHead);
            */

            // Original AlphaGo policy head
            policyHead = tf.layers.conv2d({
                kernelSize: [1, 1],
                filters: 32,
                kernelRegularizer: tf.regularizers.l2({l2: l2_parameter}),
            }).apply(policyHead);
            policyHead = tf.layers.batchNormalization().apply(policyHead);
            policyHead = tf.layers.reLU().apply(policyHead);
            policyHead = tf.layers.flatten().apply(policyHead);
            policyHead = tf.layers.dense({
                units: output_actions,
                useBias: true,
                activation: 'softmax',
                kernelRegularizer: tf.regularizers.l2({l2: l2_parameter}),
            }).apply(policyHead);

            return policyHead;
        };

        // Create the value/policy head from the main resnet
        let valueHead = createValueHead(mainNetwork);
        let policyHead = createPolicyHead(mainNetwork);
        
        // Create the model
        let model = tf.model({
            inputs: input,
            outputs: [valueHead as tf.SymbolicTensor, policyHead as tf.SymbolicTensor],
        })

        // Post a summary of the model
        // model.summary();

        // And compile the network with our loss function
        model.compile({
            optimizer: tf.train.momentum(learningRate, momentum),
            loss: ['meanSquaredError', 'categoricalCrossentropy'],
            metrics: ['mse', 'categoricalCrossentropy'],
        });

        // Prime the model, for quick evaluation later
        let result = model.predict(tf.tensor4d([input_tensor]));
        result[0].arraySync();

        this.model = model;
    }

    async getNNModel() {
        return this.model;
    }

    async getInt8NNModel() {
        // Save the model
        await this.model.save('file://' + path.resolve('../../models/MyModel'));
        // Convert to an int8 graph model
        await new Promise(function (resolve, reject) {
            let child = spawn("./convert-model.sh", [
                "--input_format=tfjs_layers_model",
                "--output_format=tfjs_graph_model",
                "--quantize_uint8", "*",
                "./models/MyModel/model.json",
                "./models/Int8Model",
            ], {
                cwd: path.resolve('../..'),
            });
            child.addListener("error", reject);
            child.addListener("exit", resolve);
        });
        // Get the newly converted model
        let graphModel = await tf.loadGraphModel('file://' + path.resolve('../../models/Int8Model/model.json'));
        return graphModel;
    }
};

type TFModel = tf.LayersModel | tf.GraphModel;

class NNBatcher {
    // How many requests to accumulate in each batch
    batchSize: number;
    // Max amount of time to wait before dispatching,
    // even if the batch size isn't full yet
    latencyMS: number;
    // NN model
    nnModel: TFModel;
    // Pending inputs, callbacks, and result promises
    pendingNNInput: (number[][][])[];
    pendingResolutionCalls: ((_: number[][]) => void)[];
    pendingNNResults: Promise<number[][]>[];

    constructor(nnModel: TFModel, batchSize: number, latencyMS: number) {
        this.nnModel = nnModel;
        this.batchSize = batchSize;
        this.latencyMS = latencyMS;

        this.resetPendingBatch();
    }

    getNNResult(inputTensor: number[][][]): Promise<number[][]> {
        // Push the input, and get the promise we'll be waiting for
        let index = this.pendingNNInput.length;
        this.pendingNNInput.push(inputTensor);
        let promise = this.pendingNNResults[index];
        // If this is the first, set a latency timeout to trigger the dispatch eventually
        if (this.pendingNNInput.length == 1) {
            let prevNNPendingInput = this.pendingNNInput;
            setTimeout(() => {
                // Assuming it's still waiting on the same input,
                // then it's been too long, so dispatch the calculation out
                if (this.pendingNNInput == prevNNPendingInput) {
                    this.dispatchNNCalculation();
                }
            }, this.latencyMS);
        }
        // Once the batch is full, dispatch it
        if (this.pendingNNInput.length == this.batchSize) {
            this.dispatchNNCalculation();
        }
        return promise;
    }

    // Reset the batch to be pending new awaits
    resetPendingBatch() {
        this.pendingResolutionCalls = [];
        this.pendingNNResults = [];
        this.pendingNNInput = [];
        for(let i = 0; i < this.batchSize; i++) {
            // Push the resolve callback, and the promise itself, to the pending list
            let promise = new Promise<number[][]>((resolve, reject) => {
                this.pendingResolutionCalls.push(resolve);
            });
            this.pendingNNResults.push(promise);
        }
    };

    // Dispatch the NN calculation, and clear anything pending
    dispatchNNCalculation() {
        // Dispatch the pending NN calculations
        (async (NNInput: (number[][][])[], resolutionCalls: ((_: number[][]) => void)[]) => {
            // Number of pending computations
            let numPendingCalculations = NNInput.length;
            if (numPendingCalculations == 0) {
                return;
            }

            // Setup the input tensor
            let batchedInputTensor: tf.Tensor4D = tf.tensor4d(NNInput);

            // Calculate the result, using a batch-size of the entire array
            let resultTensor: tf.Tensor2D[] = this.nnModel.predict(batchedInputTensor, {
                'batchSize': numPendingCalculations,
            }) as tf.Tensor2D[];

            // Gather and distribute the result
            let valueResult = await resultTensor[0].array();
            let policyResult = await resultTensor[1].array();
            // Free the tensors from the computation
            tf.dispose([
                batchedInputTensor,
                resultTensor[0],
                resultTensor[1],
            ]);
            // Pass the data to anyone waiting for it
            for(let i = 0; i < numPendingCalculations; i++) {
                resolutionCalls[i]([
                    valueResult[i],
                    policyResult[i],
                ]);
            }
        })(this.pendingNNInput, this.pendingResolutionCalls);
        // Reset the pending batch to start accepting new pending requests
        this.resetPendingBatch();
    };
}

export {
    NN,
    NNBatcher,
};
