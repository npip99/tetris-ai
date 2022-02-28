import * as tf from '@tensorflow/tfjs-node-gpu';
import path from 'path';
import { spawn } from 'child_process';

// Handles TFJS in a separate thread

async function createNNModel(input_tensor: number[][][], output_actions: number): Promise<tf.LayersModel> {
    // Topology parameters
    const numFilters = 64; // 256
    const numBlocks = 10; // 40
    const numSEChannels = 32;

    // HyperParameters
    const l2_parameter = 1e-4;
    const learningRate = 0.005;
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
    let zeroTensor = tf.zerosLike([input_tensor]);
    let result = model.predict(zeroTensor);
    await result[0].array();
    zeroTensor.dispose();

    return model;
}

async function createInt8NNModel(model: tf.LayersModel): Promise<tf.GraphModel> {
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

let models: Record<number, tf.LayersModel> = {};

addEventListener('message', async e => {
    let data = e.data;
    if (data.type == 'CREATE_MODEL') {
        let model = await createNNModel(data.input_tensor, data.output_actions);
        models[data.id] = model;
        postMessage({
            type: 'MODEL_CREATED',
            id: data.id,
        });
    } else if (data.type == 'INFERENCE_REQUEST') {
        let nnInput = data.inputData as Float32Array;
        let nnInputShape = data.inputDataShape as number[];
        let batchSize = data.batchSize as number;
        let model = models[data.modelID as number];
        let inferenceID = data.id as number;

        // Setup the input tensor
        let batchedInputTensor: tf.Tensor4D = tf.tensor4d(nnInput, [nnInputShape[0], nnInputShape[1], nnInputShape[2], nnInputShape[3]]);

        // Calculate the result, using a batch-size of the entire array
        let resultTensor: tf.Tensor2D[] = model.predict(batchedInputTensor, {
            'batchSize': batchSize,
        }) as tf.Tensor2D[];

        // Await the results
        let results = await Promise.all(
            resultTensor.map(a => a.data()),
        );

        // Free the tensors from the computation
        tf.dispose(batchedInputTensor);
        tf.dispose(resultTensor);

        // Post back the inference response
        postMessage({
            type: 'INFERENCE_RESPONSE',
            id: inferenceID,
            resultData: results,
        }, undefined, results.map(arr => arr.buffer));
    } else if (data.type == 'TRAIN_REQUEST') {
        interface NNTrainingData {
            input: number[][][],
            output: number[][],
        };

        let trainingData = data.trainingData as NNTrainingData[];
        let trainingBatchSize = data.trainingBatchSize as number;
        let numEpochs = data.numEpochs as number;
        let modelID = data.modelID as number;
        let model = models[modelID];
        let trainID = data.id as number;

        // Setup the input/output
        let inputData = tf.tensor4d(trainingData.map(a => a.input));
        let outputData = trainingData[0].output.map((_, i) => {
            return tf.tensor2d(trainingData.map(a => a.output[i]));
        });

        // Train the model
        let history = await model.fit(inputData, outputData, {
            batchSize: trainingBatchSize,
            validationSplit: 0.01,
            epochs: numEpochs,
            verbose: 0,
            shuffle: true,
        });

        // Free any tensors
        tf.dispose(inputData);
        tf.dispose(outputData);

        // Save the newly trained model
        // await model.save('file://' + path.resolve('../../models/Model' + modelID + '_Train' + trainID));

        // Post back the training response, to indicate competion
        postMessage({
            type: 'TRAIN_RESPONSE',
            id: trainID,
            lossData: history.history.val_loss,
        });
    }
});
