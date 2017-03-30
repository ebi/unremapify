#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const esprima = require('esprima');
const glob = require('glob');
const argv = require('yargs')
.usage('Usage: $0 [directory]')
.demandCommand(1)
.argv;

const directory = argv._[0];
const options = {
  root: directory,
  ignore: ['**/node_modules/**', '**/bower_components/**', '**/target/**'],
};

const parseFiles = (err, files) => {
  if (err) throw err;
  files.forEach((file) => {
    const data = fs.readFileSync(file);
    const source = parseFile(path.resolve(directory), file, data.toString());
    fs.writeFileSync(file, source);
  });
}

const parseFile = (rootPath, filePath, source) => {
  const requireNodes = [];
  esprima.parse(source, {}, (node, meta) => {
    if (node.type === 'CallExpression' && node.callee.type === 'Identifier' && node.callee.name === 'require' && node.arguments[0].type === 'Literal') {
      requireNodes.push({
        start: meta.start.offset,
        end: meta.end.offset,
        path: node.arguments[0].value
      });
    }
  });
  if (requireNodes.length === 0) return source;
  
  // This now is specifically to my aliases
  const aliases = ['common', 'process', 'component', 'modules'];
  let changeOffset = 0;
  requireNodes.forEach((node) => {
    const splitPath = node.path.split('/');
    const alias = splitPath[0];
    const module = splitPath[1];
    if (aliases.indexOf(alias) === -1) return;
    let resolvePath = rootPath;
    switch (alias) {
      case 'common':
        resolvePath = path.resolve(resolvePath, 'neo2-process-base/src/main/modules/**/' + module + '.module.js');
        break;
      case 'process':
        resolvePath = path.resolve(resolvePath, 'neo2-process-common/src/main/modules/**/' + module + '.module.js');
        break;
      case 'component':
        resolvePath = path.resolve(resolvePath, 'neo2-process-component/*/src/main/modules/**/' + module + '.module.js');
        break;
      case 'modules':
        resolvePath = path.resolve(resolvePath, 'neo2-process-wireline-activation/neo2-process-wireline-activation-frontend/src/main/modules/**/' + module + '.module.js');
        break;
    }
    const resolveFile = glob.sync(resolvePath);
    resolvePath = resolveFile[0].substr(0, resolveFile[0].length - 3);
    resolvePath = path.relative(path.dirname(filePath), resolvePath);
    if (resolvePath.substr(0, 1) !== '.') {
      resolvePath = './' + resolvePath;
    }
    const requireStatement = "require('" + resolvePath + "')";
    const newSource = source.slice(0, node.start + changeOffset) + requireStatement + source.slice(node.end + changeOffset);
    changeOffset += requireStatement.length - (node.end - node.start);
    source = newSource;
  });
  return source;
}

// Run
glob('/**/*.js', options, parseFiles);
