const {test}=require('node:test');
const assert=require('node:assert/strict');
const {compare}=require('../scripts/verify-deployed-build.cjs');
const bundles='<script src="main.0123456789abcdef.js"></script><link rel="stylesheet" href="styles.0123456789abcdef.css">';
const valid='<html data-native-page-ready="true"><head>'+bundles+'<script src="https://www.googletagmanager.com/gtag/js?id=G-EXAMPLE"></script></head><body><video preload="none"><source data-src="/assets/videos/smart_trading.mp4"></video></body></html>';
test('accepts exact ready SSR while ignoring commented script tags',()=>{
  const result=compare(bundles,valid.replace('</head>','<!-- <script src="main.ffffffffffffffff.js"></script> --></head>'));
  assert.equal(result.passed,true);
});
test('rejects stale scripts even when the page otherwise renders successfully',()=>{
  const result=compare(bundles,valid.replace('main.0123456789abcdef','main.ffffffffffffffff'));
  assert.equal(result.passed,false);assert.equal(result.checks[0].passed,false);
});
test('rejects a browser-only shell and eagerly attached video source',()=>{
  const result=compare(bundles,valid.replace('data-native-page-ready="true"','').replace('data-src=','src='));
  assert.equal(result.passed,false);assert.equal(result.checks[1].passed,false);assert.equal(result.checks[2].passed,false);
});
test('rejects duplicate explicit Analytics loaders',()=>{
  const result=compare(bundles,valid.replace('</head>','<script src="https://www.googletagmanager.com/gtag/js?id=G-OTHER"></script></head>'));
  assert.equal(result.passed,false);assert.equal(result.checks[3].passed,false);
});
