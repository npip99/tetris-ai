import { AbstractGame } from './AbstractGame';

interface MCTSArgs {
    numMCTSSims: number,
    cpuct: number,
};

class Node {
    TotalVisits: number;
    ValidActions: Boolean[];
    ActionVisits: number[]; // N
    ActionAvgV: number[]; // Q
    PriorPolicy: number[]; // P
};

class MCTS {
    game: any;
    rootGameState: any;
    nnet: any;
    args: MCTSArgs;

    constructor(game, rootGameState, nnet, args: MCTSArgs) {
        this.game = game;
        this.rootGameState = rootGameState;
        this.nnet = nnet;
        this.args = args;
    }

    simulate(cPuct: number) {
        // Keeping sampling actions from root to leaf, using PUCT
        let currentGameState = this.rootGameState;
        let valid_moves = this.game.getValidMoves();

        // Selection

        // Original AlphaZero U function
        // PUCT(s,a) = Q(s,a) + U(s,a),
        // Q(s, a) = Average value from all MCTS sims into that node
        // U(s, a) = cPuct * sqrt(Sum N(s, b) / (1 + N(s, a))) * P(s, a),
        //    With N giving the number of paths taken down that branch,
        //    And P being the policy network softmax value

        // MuZero Q function with delayed rewards
        // Q(s,a) = r(s,a) + γ*Q(s')
        //    With r(s,a) giving the reward of taking that action,
        //    and Q(s') giving the average value from all MCTS sims into that node
        // Normalizing Q over the min/max found in the entire search tree
        // Q(s, a) = (r(s, a) + γ*Q(s') - q_min) / (q_max - q_min)

        // Expand the leaf

        // Backpropagate the leaf
    }

    iterate() {
        // const cPuct = 1.25; // Training
        // const Temperature = 1; // Training, 1 for 500k training steps, 0.5 for 250k training steps, 0.25 for 250k training steps
        // const cPuct = 2.4; // MatchPlay
        // const Temperature = 0.0; // MatchPlay
        // const numSimulations = 800; // 50 for Atari, 800 for Go/Chess/Shogi;

        // Call simulate() 1600 times (~0.4 seconds)

        // Select a final move
        // Sample among actions from the root node,
        // with probability weight ( N(s, a) / Sum_b N(s, b) ) ^ (1/Temperature)
        // Note, if Temperature = 0, simply pick the a with largest N(s, a) 
    }
};