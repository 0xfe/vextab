import $ from 'jquery';
import { VexTab, Artist, Vex }  from '../lib/vextab';

$(function() {
  const Renderer = Vex.Flow.Renderer;

  Artist.DEBUG = true;
  VexTab.DEBUG = false;

  // Create VexFlow Renderer from canvas element with id #boo
  const renderer = new Renderer($('#boo')[0], Renderer.Backends.SVG);

  // Initialize VexTab artist and parser.
  const artist = new Artist(10, 10, 600, {scale: 0.8});
  const vextab = new VexTab(artist);

  function render() {
    try {
      vextab.reset();
      artist.reset();
      vextab.parse($("#blah").val());
      artist.render(renderer);
      $("#error").text("");
    } catch (e) {
      console.log(e);
      $("#error").html(e.message.replace(/[\n]/g, '<br/>'));
    }
  }

  $("#blah").keyup(_.throttle(render, 250));
  render();
});
