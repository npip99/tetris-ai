#!/bin/bash

set -e
trap 'echo "Error at $BASH_SOURCE on line $LINENO!"' ERR

if which tensorflowjs_converter &>/dev/null; then
    tensorflowjs_converter "$@"
else
    docker build -t tetris-ai-tfjs-converter - < ./TFJSDockerfile
    # docker run --rm -v ${PWD}/models:/root/models -it tetris-ai-tfjs-converter bash
    docker run --rm -v ${PWD}/models:/root/models -t tetris-ai-tfjs-converter \
        tensorflowjs_converter "$@"
fi

