# docker run --gpus all -v $(pwd):/root/tetris-ai -it tensorflow/tensorflow:latest-gpu bash

FROM tensorflow/tensorflow:latest-gpu

# Install anything we need installed
RUN apt-get update && apt-get install --no-install-recommends -y \
    sudo \
    git \
    && apt-get autoremove -y \
    && apt-get clean \
    && rm -rf /tmp/* /var/tmp/*

# Setup ubuntu user
RUN useradd -rm -s /bin/bash -g root -G sudo ubuntu
RUN echo '%sudo ALL=(ALL) NOPASSWD:ALL' >> /etc/sudoers
USER ubuntu
RUN echo 'export PATH="~/.local/bin:$PATH"' >> ~/.bashrc

# Setup vim
WORKDIR /home/ubuntu
RUN git clone https://github.com/npip99/vimrc
WORKDIR /home/ubuntu/vimrc
RUN sudo apt-get update \
    && ./setup.sh -y \
    && sudo apt-get autoremove -y \
    && sudo apt-get clean \
    && sudo rm -rf /tmp/* /var/tmp/*
WORKDIR /home/ubuntu
RUN rm -r ./vimrc

# Setup tensorflowjs
RUN pip install --upgrade pip \
    && pip install tensorflowjs

# Copy the tetris-ai directory
COPY --chown=ubuntu . /home/ubuntu/tetris-ai
WORKDIR /home/ubuntu/tetris-ai

# Install dependencies
# RUN sudo apt-get update \
#     && ./setup.sh \
#     && sudo apt-get autoremove -y \
#     && sudo apt-get clean \
#     && sudo rm -rf /tmp/* /var/tmp/*
