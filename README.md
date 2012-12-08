# Vex Tab

A VexTab Parser for VexFlow.
Copyright (c) 2012 Mohit Muthanna Cheppudira.

## Important Note

This is currently experimental. Until this is complete, please use the version
of VexTab bundled with VexFlow.

## Why?

The original version of VexTab is chock full of suck. It's basically a hand-rolled
recursive descent parser that generates VexFlow elements inline. It's also a
convoluted piece of JavaScript that is very difficult to read and modify.

Oh, and I really hate JavaScript.

VexFlow was built to run with no dependencies at all (not even jQuery.) Although
it works well, I've had to re-implement half-assed versions of useful routines to
make JavaScript easier to work with (each, merge, min, max, sortby, etc.)

With this version of VexTab I'm going to relax my "no dependency" restriction and
experiment with some technologies that make in-browser programming simpler to
work with.

This rewrite of VexTab has three key dependencies:

  * [CoffeeScript](http://coffeescript.org/) - A *nicer* JavaScript.
  * [Jison](http://zaach.github.com/jison/) - An LALR(1) parser modeled on Bison.
  * [Underscore.js](http://underscorejs.org/) - A utility-belt library for JavaScript.

## Setup

First install Node:

    $ brew install node (on OSX)
    $ sudo apt-get install node (on Linux)

Then install CoffeScript and Jison. Do this form the root VexTab directory so it
creates a sub-directory called `node-modules`.

    $ npm install jison coffee-script

## Build and Test

Run `build.sh` and pull up `build/src/runtest.html` in your browser.

If you want to auto-build on changes to source files, you need to install the Ruby gem `guard`. If you have `bundler` you can do the following.

    $ bundle install
    $ bundle exec guard

## Links

* [VexTab Home](http://vextab.com)
* [The VexTab Tutorial](http://vexflow.com/vextab/tutorial.html)
* [Google Group](https://groups.google.com/forum/?fromgroups#!forum/vexflow)
* [Me](http://0xfe.muthanna.com)
