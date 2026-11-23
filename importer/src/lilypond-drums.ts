// Literal drum aliases, MIDI keys and staff positions from LilyPond's default drums-style.
import type { Drum } from './expression.js';

const kit = new Map<string,Drum>();
function add(id:string,alias:string,midi:number,position:number,head:Drum['head']='normal') {
  // LilyPond counts half-lines from the middle. VexFlow numbers the bottom staff line one.
  const entry:Drum={id,name:id,midi,line:3 + position/2,head,stem:position>=0?'down':'up'};
  kit.set(id,entry); kit.set(alias,entry);
}
add('acousticbassdrum','bda',35,-3);
add('bassdrum','bd',36,-3);
add('sidestick','ss',37,1,'cross');
add('snare','sn',38,1);
add('acousticsnare','sna',38,1);
add('handclap','hc',39,1,'triangle');
add('electricsnare','sne',40,1);
add('lowfloortom','tomfl',41,-4);
add('hihat','hh',42,3,'cross');
add('highfloortom','tomfh',43,-2);
add('pedalhihat','hhp',44,-5,'cross');
add('lowtom','toml',45,-1);
add('halfopenhihat','hhho',46,3,'circle-cross');
add('lowmidtom','tomml',47,0);
add('himidtom','tommh',48,2);
add('crashcymbal','cymc',49,5,'circle-cross');
add('hightom','tomh',50,4);
add('ridecymbal','cymr',51,5,'cross');
add('ridebell','rb',53,5);
add('cowbell','cb',56,5,'triangle');
export const drumByName = (name:string) => kit.get(name);

