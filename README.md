# VexTab 2.0

A VexTab Parser for VexFlow.
Copyright (c) 2012 Mohit Muthanna Cheppudira.

## What is VexTab?

VexTab is a language that allows you to easily create, edit, and share music notation
and guitar tablature. Unlike ASCII tab, which is designed for readability, VexTab is
designed for writeability.

Go try it out at [The VexTab Tutorial](http://vexflow.com/vextab/tutorial.html).

If you want to save and share your VexTab, try out [My Vexflow](http://my.vexflow.com).

## Updates

VexTab 2.0 now supports all VexTab 1.0 features, and [includes a few new ones](http://my.vexflow.com/articles/53?source=enabled).

## Why 2.0?

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

## Prerequisites (for VexTab developers)

First install Node:

    $ brew install node (on OSX)
    $ sudo apt-get install node (on Linux)

Then install CoffeScript and Jison. Do this from the root VexTab directory so it creates a sub-directory called `node-modules`.

    $ npm install jison coffee-script

Next, install Ruby and the `bundler` gem. Then install all the dependencies
by typing:

    $ bundle install

Quesions? Ask the [VexFlow Google Group](https://groups.google.com/forum/?fromgroups#!forum/vexflow).

## Build and Test

Run `rake` and pull up `build/src/runtest.html` in your browser.

If you want to auto-build on changes to source files type:

    $ rake watch

## License

VexTab is an open specification and the reference implementation (this repository)
is open source. It is freely available complete and uncrippled for non-commercial use.

If you would like to use this code on commercial websites, products, plugins, or tools,
please get in touch with me. (I'm very reasonable.)

Note that the underlying library, VexFlow, is completely open source and distributed
under the MIT license. See the [VexFlow GitHub Page](http://github.com/0xfe/vexflow)
for details.

## Links

* [VexTab Home](http://vexflow.com/vextab)
* [The VexTab Tutorial](http://vexflow.com/vextab/tutorial.html)
* [Google Group](https://groups.google.com/forum/?fromgroups#!forum/vexflow)
* [VexFlow Home](http://vextab.com)
* [My VexFlow](http://my.vexflow.com)
* [Me](http://0xfe.muthanna.com)
