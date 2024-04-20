#!/bin/bash

rm -r ./build
mkdir -p ./build
cp ./index.html ./build/

tailwindcss -i ./input.css -o ./build/output.css 