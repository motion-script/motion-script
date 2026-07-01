// @ts-check
/** @type {import("@docusaurus/plugin-content-docs").SidebarsConfig} */
const typedocSidebar = {items:[
  {type:"category",label:"nodes",items:[
    {type:"doc",id:"core/nodes/classes/Node",label:"Node"}
  ],link:{type:"doc",id:"core/nodes/index"}},
  {type:"category",label:"runtime",items:[
    {type:"doc",id:"core/runtime/classes/Timeline",label:"Timeline"}
  ],link:{type:"doc",id:"core/runtime/index"}}
]};
module.exports = typedocSidebar.items;
