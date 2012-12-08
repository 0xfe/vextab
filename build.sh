#!/bin/bash
#
# Before running, install Node and Jison.
#
# brew install node
# apt-get install node
#
# npm install jison
# npm install coffee-script

./node_modules/.bin/jison src/vextab.jison -o build/vextab_parser.js
./node_modules/.bin/coffee --join build/vextab_coffee.js --compile src/*.coffee
cp src/runtest.html build/
