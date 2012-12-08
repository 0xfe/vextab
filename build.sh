#!/bin/bash
#
# Before running, install Node and Jison.
#
# brew install node
# apt-get install node
#
# npm install jison
# npm install coffee-script

rm -rf build/
mkdir -p build/output

./node_modules/.bin/jison src/vextab.jison -o build/output/vextab_parser.js
./node_modules/.bin/coffee -o build/output --compile src/*.coffee
cp -R src build/
cp -R support build/
