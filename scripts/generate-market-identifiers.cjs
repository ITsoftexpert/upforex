// Only the site's explicit index/stock fullName fields are named instruments.
// Never infer exemptions from a sentence, general words, or capital letters.
const fs=require('node:fs'),ts=require('typescript');
const source='src/app/components/resources/contact-specifications/constant.ts';
const ast=ts.createSourceFile(source,fs.readFileSync(source,'utf8'),ts.ScriptTarget.Latest,true),names=[];
for(const statement of ast.statements)if(ts.isVariableStatement(statement))
  for(const declaration of statement.declarationList.declarations)
    if(['stocks','indices'].includes(declaration.name.getText(ast))&&ts.isArrayLiteralExpression(declaration.initializer))
      for(const entry of declaration.initializer.elements)if(ts.isObjectLiteralExpression(entry))
        for(const property of entry.properties)
          if(ts.isPropertyAssignment(property)&&property.name.getText(ast)==='fullName'&&ts.isStringLiteral(property.initializer))names.push(property.initializer.text);
const identifiers=[...new Set(names)];
fs.writeFileSync('src/app/core/config/market-identifiers.ts',
  '// Generated from exact existing index/stock fullName fields. No marketing prose is exempt.\n'+
  'export const MARKET_IDENTIFIERS: ReadonlySet<string> = new Set('+JSON.stringify(identifiers,null,2)+');\n');
console.log('Named instrument identities preserved: '+identifiers.length);
