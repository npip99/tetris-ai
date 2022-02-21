#!/bin/bash

set -e
trap 'echo "Error at $BASH_SOURCE on line $LINENO!"' ERR

docker build -t tetris-ai-tester .
docker run --gpus all -it tetris-ai-tester bash
