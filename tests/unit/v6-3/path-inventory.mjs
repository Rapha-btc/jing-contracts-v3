// Offline inventory of the original Clarity source; no source instrumentation.
export function inventory(source) {
  let i=0,line=1;
  const whitespace=()=>{while(i<source.length){if(source.startsWith(';;',i)){while(i<source.length&&source[i]!=='\n')i++;}else if(/\s/.test(source[i])){if(source[i++]==='\n')line++;}else break;}};
  const parse=()=>{
    whitespace(); const start=i,startLine=line;
    if(source[i]==='('){i++;const children=[];while(true){whitespace();if(i>=source.length)throw Error('Unclosed Clarity list');if(source[i]===')'){i++;break;}children.push(parse());}return {start,end:i,line:startLine,endLine:line,children};}
    if(source[i]==='"'){i++;while(i<source.length){const c=source[i++];if(c==='\\'){i++;continue;}if(c==='\n')line++;if(c==='"')break;}}
    else {while(i<source.length&&!/[\s()]/.test(source[i]))i++;}
    if(i===start)throw Error(`Unexpected token at ${i}`);
    return {start,end:i,line:startLine,endLine:line,atom:source.slice(start,i)};
  };
  const roots=[];while(true){whitespace();if(i>=source.length)break;roots.push(parse());}
  const functions=[],arms=[];
  const walk=(node,fn,kind)=>{
    if(!node.children)return;
    const [head,...args]=node.children;const op=head.atom;
    if(/^define-(public|private|read-only)$/.test(op??'')){fn=args[0].children[0].atom;kind=op.slice(7);functions.push({name:fn,kind,line:node.line,endLine:node.endLine});}
    if(['asserts!','unwrap!','unwrap-err!','try!'].includes(op))arms.push({id:`${fn}:L${node.line}`,function:fn,kind,line:node.line,endLine:node.endLine,op,expression:source.slice(node.start,node.end),errorLine:op==='try!'?null:args[1]?.line,error:op==='try!'?null:source.slice(args[1].start,args[1].end),operand:args[0]});
    for(const child of node.children)walk(child,fn,kind);
  };
  for(const root of roots)walk(root,'(top)','top');
  return {functions,arms};
}

// SDK traces identify function-call sites and their returned response. Native
// operators without call frames are deliberately not inferred from the root error.
export function responseFrames(trace) {
  const stack=[],responses=[];
  for(const text of trace.split('\n')){
    const depth=text.search(/[├└]/);
    const call=text.match(/[├└]── \( (.*?) \)  market:(\d+):(\d+)$/);
    if(call){while(stack.length&&stack.at(-1).depth>=depth)stack.pop();stack.push({depth,line:Number(call[2]),call:call[1]});continue;}
    const result=text.match(/[├└]── \((err|ok)\b(.*)\)$/);
    if(result){const frame=stack.findLast(f=>f.depth+4===depth);if(frame)responses.push({...frame,result:result[1],value:result[2].trim()});}
  }
  return responses;
}
