const {test}=require('node:test'),assert=require('node:assert/strict');
const {protectPublicEmailMarkup}=require('../tmp/server-tests/email-obfuscation.js');
const document=body=>'<html data-native-page-ready="true"><head><title>Same title</title></head><body><app-root ng-version="21.2.26">'+body+'</app-root><script id="ng-state" type="application/json">{"email":"support@upforex.com"}</script></body></html>';
test('Cloudflare exclusion wraps public root and preserves exact document bytes and hydration children',()=>{
 const input=document('<p>support@upforex.com</p><a href="mailto:support@upforex.com">Email support</a><!--ng-container-->');
 const result=protectPublicEmailMarkup(input);
 assert(result.includes('<!--email_off--><app-root'));
 assert(result.includes('</app-root><!--/email_off--><script'));
 assert.equal(result.replace('<!--email_off-->','').replace('<!--/email_off-->',''),input);
 assert.equal(result.match(/<!--email_off-->/g).length,1);
});
test('repeated protection is idempotent',()=>{
 const once=protectPublicEmailMarkup(document('Contact support@upforex.com'));
 assert.equal(protectPublicEmailMarkup(once),once);
});
test('admin, incomplete, missing-root and ordinary HTML retain their existing behavior',()=>{
 for(const input of ['<html><body><app-root>Admin login</app-root></body></html>',document('Source').replace('data-native-page-ready="true"','data-native-page-ready="false"'),'<html data-native-page-ready="true"><body>Not a root</body></html>',document('Source').replace('</app-root>','')])assert.equal(protectPublicEmailMarkup(input),input);
});
test('quoted, unquoted and RTL completed documents are protected without changing their text',()=>{
 for(const value of ['"true"',"'true'",'true']){
  const input=document('<p dir="rtl">\u0627\u0644\u062f\u0639\u0645 support@upforex.com</p>').replace('"true"',value);
  const result=protectPublicEmailMarkup(input);assert(result.includes('<!--email_off-->'));assert(result.includes('\u0627\u0644\u062f\u0639\u0645 support@upforex.com'));
 }
});
