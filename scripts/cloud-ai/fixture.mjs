export const cloudAIFiles={
 'backend-limit.mjs':'export function add(a, b) { return a - b; }\nexport function multiply(a, b) { return a + b; }\n',
 'backend-limit.test.mjs':"import test from 'node:test';import assert from 'node:assert/strict';import {add,multiply} from './backend-limit.mjs';\ntest('add positives',()=>assert.equal(add(2,3),5));\ntest('add negative',()=>assert.equal(add(-2,3),1));\ntest('add zero',()=>assert.equal(add(0,7),7));\ntest('multiply positives',()=>assert.equal(multiply(2,3),6));\ntest('multiply negative',()=>assert.equal(multiply(-2,3),-6));\ntest('multiply zero',()=>assert.equal(multiply(0,7),0));\n"
};
export const cloudAIPrompt='Repair two arithmetic bugs in the synthetic module: add must return the sum of its two numeric inputs; multiply must return their product. Read allowed files and use native edit/write tools. Protected tests must remain unchanged. No shell, network tools, delegation or files outside the two permitted paths.';
