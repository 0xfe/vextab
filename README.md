# VexTab 3.0

A VexTab Parser for VexFlow.
Copyright (c) 2012 Mohit Muthanna Cheppudira.

## Need Help? Ask on the [VexFlow Google Group.](https://groups.google.com/forum/?fromgroups#!forum/vexflow)

## What is VexTab?

VexTab is a language that allows you to easily create, edit, and share music notation and guitar tablature. Unlike ASCII tab, which is designed for readability, VexTab is designed for writeability.

Go try it out at [The VexTab Tutorial](http://vexflow.com/vextab/tutorial.html).

If you want to save and share your VexTab, try out [My Vexflow](http://my.vexflow.com).

To see what VexTab can do, take a look at the [list of features](http://my.vexflow.com/articles/53?source=enabled).

## Quick Start

Simply include `dist/div.prod.js` into your HTML document via a script tag. The contents of all `div` elements with the class `vextab-auto` are parsed as VexTab and automatically rendered in-place as music notation.

```html
<div class="vextab-auto"
    width=680 scale=1.0 editor="true"
    editor-width=680 editor-height=330>
    options space=20
    tabstave notation=true key=A time=4/4

    notes :q =|: (5/2.5/3.7/4) :8 7-5h6/3 ^3^ 5h6-7/5 ^3^ :q 7V/4 |
    notes :8 t12p7/4 s5s3/4 :8 3s:16:5-7/5 :h p5/4
    text :w, |#segno, ,|, :hd, , #tr

    options space=25
</div>
```

Some of the available `div` attributes are:

* `editor`: `true`|`false` -- Enable/disable live editor. Default `false`.
* `scale`: `0.5` -> `3.0` -- Scale factor for rendering. Default `1.0`.
* `editor-width`, `editor-height`: pixels -- Dimensions of editor.

Note that the provided `dist/div.dev.js` bundle is unminified, and `dist/div.prod.js` is minified. They include bundled versions of zepto, lodash, and VexFlow. You can get access to some of these classes, and the VexTab API (see below) via the `vextab` global.

* `vextab.Div`: The TabDiv class used to implement the auto-render functionality for `div` elements.
* `vextab.VexTab`: The parser. See API below.
* `vextab.Artist`: The renderer. See API below.
* `vextab.Vex`: The `Vex` namespace from the VexFlow library.

## VexTab API

If you want to do more interesting things with VexTab, you can use the API directly.

```
$ npm install vextab
```

Basic usage [jsfiddle](https://jsfiddle.net/ogL5w6ja/2/)

```js
import {VexTab, Artist, Vex} from 'vextab';

const Renderer = Vex.Flow.Renderer;

// Create VexFlow Renderer from canvas element with id #boo
const renderer = new Renderer($('#boo')[0], Renderer.Backends.SVG);

// Initialize VexTab artist and parser.
const artist = new Artist(10, 10, 600, { scale: 0.8 });
const tab = new VexTab(artist);

try {
    tab.parse('tabstave').val());
    artist.render(renderer);
} catch (e) {
    console.error(e);
}
```

See `tests/playground.js` for a working example of the VexTab API in use.

## Developers

Clone this repository. Then run the following commands to setup a basic build and run tests:

```
$ npm install
$ npm start
```

If you have the `grunt-cli` NPM package installed, you can manually run the various build steps:

Browse to http://localhost:9005 to run tests.

### Publishing new packages

Update vexflow dependency if necessary.

```
$ npm install -g grunt-cli
$ npm upgrade vexflow
$ grunt (lint|build|publish)
```

Before sending in a pull request, make sure that the tests pass a visual inspection. Open `http://localhost:9005` in your browser and verify that the notation examples at the bottom of the page render correctly. Also open `http://localhost:9005/playground.html` and verify that your new feature/bug fix, etc. works correctly.

Please add new tests for whatever you're working on. Don't send PRs without tests. Thanks!

### Working with a local VexFlow installation

```
$ git clone vexflow_repo
$ cd vexflow
$ npm link
$ cd ~/git/vextab
$ npm link vexflow
```

You may have to run `npm link vexflow` everytime you install or upgrade an npm package.

## Other Dependencies

This rewrite of VexTab has three key dependencies:

  * [CoffeeScript](http://coffeescript.org/) - A *nicer* JavaScript.
  * [Jison](http://zaach.github.com/jison/) - An LALR(1) parser modeled on Bison.
  * [lodash](http://lodash.com/) - A utility-belt library for JavaScript.

For the audio player feature, you need:

  * [MIDI.js](https://github.com/mudcube/MIDI.js) - A soundfont renderer for the web.
  * Soundfonts for various instruments - See MIDI.js for more information.

## Help

Questions? Ask the [VexFlow Google Group](https://groups.google.com/forum/?fromgroups#!forum/vexflow).

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
