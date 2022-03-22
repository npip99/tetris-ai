#!/bin/bash

set -e
function exit {
    echo "Error at $BASH_SOURCE on line $1!"
    if [[ ! -z "$CONTAINER_ID" ]]; then
        docker kill "$CONTAINER_ID"
    fi
}
trap 'exit $LINENO' ERR

docker build -t tetris-ai-tester .
CONTAINER_ID=$(docker run --gpus all -dit tetris-ai-tester bash | cut -c1-8)
echo "Docker instance started, with container ID $CONTAINER_ID"
