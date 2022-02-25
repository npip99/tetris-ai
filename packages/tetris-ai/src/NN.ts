
import Worker from 'web-worker';

// Manage webworker

let worker = null;

function createWorker() {
    const url = new URL('./NNWorker.js', 'file://' + __dirname + '/build');
    worker = new Worker(url);

    worker.addEventListener('message', e => {
        let data = e.data;
        if (data.type === 'MODEL_CREATED') {
            pendingModels[data.id]();
            delete pendingModels[data.id];
        } else if (data.type == 'INFERENCE_RESPONSE') {
            pendingInferences[data.id](data.resultData);
            delete pendingInferences[data.id];
        }
    });
}

function destroyWorker() {
    worker.terminate();
    worker = null;
}

// Interface for the NN model and batcher

type TFModel = number;

let models: Record<TFModel, boolean> = {};
let pendingModels: Record<TFModel, () => void> = {};
let pendingInferences: Record<number, (_: number[][][]) => void> = {};

class NN {
    modelID: TFModel;
    modelPromise: Promise<TFModel>;

    constructor(input_tensor: number[][][], output_actions: number) {
        if (worker == null) {
            createWorker();
        }

        this.modelID = Math.floor(Math.random() * 2147483647);
        this.modelPromise = new Promise<TFModel>((resolve, reject) => {
            pendingModels[this.modelID] = () => {
                resolve(this.modelID);
            };
        });

        models[this.modelID] = true;
        worker.postMessage({
            type: 'CREATE_MODEL',
            input_tensor,
            output_actions,
            id: this.modelID,
        });
    }

    async getNNModel(): Promise<TFModel> {
        let model = await this.modelPromise;
        return model;
    }

    async getInt8NNModel(): Promise<TFModel> {
        throw new Error("Int8 not implemented yet with WebWorkers");
    }

    destroy() {
        delete models[this.modelID];

        if (Object.keys(models).length == 0) {
            destroyWorker();
        }
    }
};

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
        (async (inputData: (number[][][])[], resolutionCalls: ((_: number[][]) => void)[]) => {
            // Number of pending computations
            let numPendingCalculations = inputData.length;
            if (numPendingCalculations == 0) {
                return;
            }

            // Setup a promise for the inference result
            let inferenceID = Math.floor(Math.random() * 2147483647);
            let inferencePromise = new Promise<number[][][]>((resolve, reject) => {
                pendingInferences[inferenceID] = (data: number[][][]) => {
                    resolve(data);
                };
            });

            // Request an inference
            worker.postMessage({
                type: 'INFERENCE_REQUEST',
                id: inferenceID,
                modelID: this.nnModel,
                inputData,
            });

            // Get the inference result
            let inferenceResult = await inferencePromise;
            let valueResult = inferenceResult[0];
            let policyResult = inferenceResult[1];

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
