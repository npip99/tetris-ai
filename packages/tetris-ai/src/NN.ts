
import Worker from 'web-worker';


// Interface for the NN model and batcher

type TFModel = number;
interface NNTrainingData {
    input: number[][][],
    output: number[][],
};

type LossData = number[];

// Manage webworker

let worker = null;
let models: Record<TFModel, boolean> = {};
let pendingModels: Record<TFModel, () => void> = {};
let pendingInferences: Record<number, (_: Float32Array[]) => void> = {};
let pendingTraining: Record<number, (_: LossData) => void> = {};

function createWorker() {
    const url = new URL('./NNWorker.js', 'file://' + __dirname + '/build');
    worker = new Worker(url);

    worker.addEventListener('message', (e: any) => {
        let data = e.data;
        if (data.type === 'MODEL_CREATED') {
            pendingModels[data.id]();
            delete pendingModels[data.id];
        } else if (data.type == 'INFERENCE_RESPONSE') {
            pendingInferences[data.id](data.resultData);
            delete pendingInferences[data.id];
        } else if (data.type == 'TRAIN_RESPONSE') {
            pendingTraining[data.id](data.lossData);
            delete pendingTraining[data.id];
        }
    });
}

function destroyWorker() {
    worker.terminate();
    worker = null;
}

// Neural Network

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

    async evaluateBatch(inputData: (number[][][])[], batchSize?: number): Promise<(number[][])[]> {
        // Make sure the model exists first
        await this.getNNModel();

        // Setup a promise for the inference result
        let inferenceID = Math.floor(Math.random() * 2147483647);
        let inferencePromise = new Promise<Float32Array[]>((resolve, reject) => {
            pendingInferences[inferenceID] = (data: Float32Array[]) => {
                resolve(data);
            };
        });

        // Efficiently construct a TypedArray out of the inputData
        let inputDataShape = [inputData.length, inputData[0].length, inputData[0][0].length, inputData[0][0][0].length];
        let internalBuffer = new ArrayBuffer(4 * inputDataShape[0] * inputDataShape[1] * inputDataShape[2] * inputDataShape[3]);
        let inputDataTypedArray = new Float32Array(internalBuffer);
        let offset = 0;
        for(let i = 0; i < inputDataShape[0]; i++) {
            for(let j = 0; j < inputDataShape[1]; j++) {
                for(let k = 0; k < inputDataShape[2]; k++) {
                    for(let m = 0; m < inputDataShape[3]; m++) {
                        inputDataTypedArray[offset] = inputData[i][j][k][m];
                        offset++;
                    }
                }
            }
        }

        // Request an inference
        worker.postMessage({
            type: 'INFERENCE_REQUEST',
            id: inferenceID,
            modelID: this.modelID,
            inputData: inputDataTypedArray,
            inputDataShape: inputDataShape,
            batchSize: batchSize || inputData.length,
        }, [internalBuffer]);

        // Get the inference result
        let inferenceResult = await inferencePromise;

        // Number of inferences we requested / got back
        let numInferences = inputData.length;
        // Get the shape of each output, based of the total length of each output array
        let shape = [];
        for(let output_id = 0; output_id < inferenceResult.length; output_id++) {
            // Divide total data points, by num of inferences, to get the number of floats per output, for this output_id
            shape.push(inferenceResult[output_id].length / numInferences);
        }

        // Create an inference-by-inference organization of the output,
        // By slicing into each output to get the data we want
        let organizedResults = [];
        for(let i = 0; i < numInferences; i++) {
            organizedResults.push(shape.map((shapeSize, output_id) => {
                return Array.prototype.slice.call(inferenceResult[output_id].subarray(i * shapeSize, i * shapeSize + shapeSize));
            }));
        }

        // Return the organize results
        return organizedResults;
    }

    async trainBatch(trainingData: NNTrainingData[], trainingBatchSize: number, numEpochs: number): Promise<LossData> {
        // Make sure the model exists first
        await this.getNNModel();

        // Setup a promise for the inference result
        let trainID = Math.floor(Math.random() * 2147483647);
        let trainPromise = new Promise<LossData>((resolve, reject) => {
            pendingTraining[trainID] = (data: LossData) => {
                resolve(data);
            };
        });

        // Request an inference
        worker.postMessage({
            type: 'TRAIN_REQUEST',
            id: trainID,
            modelID: this.modelID,
            trainingData: trainingData,
            trainingBatchSize: trainingBatchSize,
            numEpochs: numEpochs,
        });

        // Wait for the training to finish
        return await trainPromise;
    }

    destroy() {
        delete models[this.modelID];

        if (Object.keys(models).length == 0) {
            destroyWorker();
        }
    }
};

export {
    NN,
    NNTrainingData,
};
