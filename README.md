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

## Dependencies

This rewrite of VexTab has three key dependencies:

  * [CoffeeScript](http://coffeescript.org/) - A *nicer* JavaScript.
  * [Jison](http://zaach.github.com/jison/) - An LALR(1) parser modeled on Bison.
  * [Underscore.js](http://underscorejs.org/) - A utility-belt library for JavaScript.

For the audio player feature, you need:

  * [MIDI.js](https://github.com/mudcube/MIDI.js) - A soundfont renderer for the web.
  * Soundfonts for various instruments - See MIDI.js for more information.

## Prerequisites (for VexTab developers)

First install Node:

    $ brew install node (on OSX)
    $ sudo apt-get install node (on Linux)

Then install the depdencies managed in the `package.json`:

    $ npm install

Next, install Ruby and the `bundler` gem. Then install all the dependencies
by typing:

    $ bundle install

Quesions? Ask the [VexFlow Google Group](https://groups.google.com/forum/?fromgroups#!forum/vexflow).

## Build and Test

Run `rake` and pull up `build/src/runtest.html` in your browser.

If you want to auto-build on changes to source files type:

    $ rake watch

## License

VexTab is an open specification and the reference implementation (this repository) is open source. It is freely available complete and uncrippled for non-commercial use.

If you would like to use this code on commercial websites, products, blogs, plugins, or tools, please get in touch with me. (I'm very reasonable.)

Copyright (c) 2012 Mohit Muthanna Cheppudira

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

The above copyright notice shall be included in all copies or substantial portions of the Software.

**Note**: The underlying library, VexFlow, is completely open source and distributed under the MIT license. See the [VexFlow GitHub Page](http://github.com/0xfe/vexflow) for details.

## Links

* [VexTab Home](http://vexflow.com/vextab/)
* [The VexTab Tutorial](http://vexflow.com/vextab/tutorial.html)
* [Google Group](https://groups.google.com/forum/?fromgroups#!forum/vexflow)
* [VexFlow Home](http://vexflow.com)
* [My VexFlow](http://my.vexflow.com)
* [Me](http://0xfe.muthanna.com)
