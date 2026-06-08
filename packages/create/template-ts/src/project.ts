import { ExampleScene } from "./scenes/example";
import { createProject } from '@motion-script/core';

export default createProject({
  name: 'Example Project',
  scenes: [new ExampleScene()]
});

