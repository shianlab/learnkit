'use strict';
function plainMarkdown(value){return value.replace(/!\[[^\]]*\]\([^)]*\)/g,'').replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/^\s*(?:#{1,6}\s+|>\s*|[-*+]\s+|\d+\.\s+)/gm,'').replace(/[*_`]/g,'');}
const compact=value=>plainMarkdown(value).replace(/\s+/g,'');
function containsQuote(block,quote){return compact(block.text).includes(compact(quote))&&compact(quote).length>0;}
function resolveAnnotation(annotation,lesson){
  const blocks=lesson.text?.paragraphs||lesson.blocks;
  const id=b=>b.block_id||b.id;
  const existing=blocks.find(b=>id(b)===annotation.block_id);
  if(existing&&containsQuote(existing,annotation.quote))return {...annotation,resolved_block_id:id(existing),anchor_state:'anchored'};
  const candidates=blocks.filter(b=>containsQuote(b,annotation.quote));
  if(candidates.length===1)return {...annotation,resolved_block_id:id(candidates[0]),anchor_state:'reanchored'};
  return {...annotation,resolved_block_id:null,anchor_state:'orphaned',anchor_reason:candidates.length?'原文中存在多个相同片段，请重新关联。':'原文已变更，摘录和批注已保留，请重新关联。'};
}
module.exports={plainMarkdown,compact,containsQuote,resolveAnnotation};
