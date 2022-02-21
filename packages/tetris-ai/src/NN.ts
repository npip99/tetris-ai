import * as tf from '@tensorflow/tfjs-node-gpu';

class NN {
    model: tf.LayersModel;

    constructor(input_width: number, input_height: number, input_channels: number, output_actions: number) {
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
            shape: [input_height, input_width, input_channels],
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

        this.model = model;
    }
};

export {
    NN,
};
