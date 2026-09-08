import {parseNavigation} from './svg-navigation.js';
describe('SVG navigation',()=>{
  it('uses nested geometry and local label instead of a guessed rectangle',()=>{
    const links = parseNavigation('<svg><g transform="translate(10,20)" shortcut="page://page2.svg"><g><image x="30" y="40" width="100" height="80"/></g><text><tspan>Lesson 2</tspan></text></g></svg>');
    expect(links[0]).toMatchObject({x:40,y:60,width:100,height:80,label:'Lesson 2',targetPageId:'page2'});
  });
  it('does not apply SMART group metadata rotation twice',()=>{
    expect(parseNavigation('<svg><g xbk_transform="rotate(90,0,0)" shortcut="page://p.svg"><rect x="10" y="20" width="30" height="40"/></g></svg>')[0]).toMatchObject({x:10,y:20,width:30,height:40});
  });
  it('rejects entity declarations',()=>{expect(()=>parseNavigation('<!DOCTYPE svg><svg/>')).toThrow();});
});
