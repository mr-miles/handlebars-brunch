'use strict';

const handlebars = require('handlebars');
const umd = require('umd-wrapper');
const sysPath = require('path');
const fs = require('fs');
const layouts = require('handlebars-layouts');

class HandlebarsCompiler {
  constructor(cfg) {
    if (cfg == null) cfg = {};
    this.optimize = cfg.optimize;
    const config = cfg.plugins.handlebars || {};
    const overrides = config.overrides;
    const defaultBaseDir = sysPath.join(cfg.paths.root, 'app');
    const defaultStaticBaseDir = sysPath.join(defaultBaseDir, 'assets');
    const defaultLayoutDir = sysPath.join(defaultStaticBaseDir, 'layout');

    if (typeof overrides === 'function') overrides(handlebars);

    const ns = config.namespace;
    this.namespace = typeof ns === 'function' ? ns : () => ns;
    this.pathReplace = config.pathReplace || /^.*templates\//;
    this.includeSettings = config.include || {};
    this.locals = config.locals || {};
    this.basedir = config.basedir || defaultBaseDir;
    this.staticBasedir = config.staticBasedir || defaultStaticBaseDir;
    this.layoutBaseDir = config.layoutBaseDir || defaultLayoutDir;
    this.partialToPathMap = {};
}

  get include() {
    let includeFile = 'handlebars';
    const include = this.includeSettings;
    if (include.runtime !== false) includeFile += '.runtime';
    if (include.amd) includeFile += '.amd';
    if (this.optimize) includeFile += '.min';
    includeFile += '.js';

    return [
      sysPath.join(__dirname, 'dist', includeFile),
      sysPath.join(__dirname, 'ns.js')
    ];
  }

  getDependencies(file) {
      //var deps = Object.keys(this.dependencies[file.path] || {});
      var deps = this.listDependencies(file);
      console.log("dependencies " + file.path + ": " + deps);
      return deps;
  };

  //getDependants(file) {
  //    //i have:
  //    //  path : paths that need me to render
  //    //
  //    //i want:
  //    //  path : paths i need to render
  //    //
  //    // A should cause B and C to recompile
  //    // this.dependencies = { A : { B: true, C: true }, B: {}, C: {}, D { C: true } }
  //    // and produce, for C
  //    // parents = { A: { B: true, C: true }, D: { C: true } }
  //    var k = Object.entries(this.dependencies);
  //    var parents = {};
  //    for (var i = 0; i < k.length; i++) {
  //        var pth = k[1][file.path];
  //        if (pth !== undefined) parents[k[0]] = k[1];
  //    }
  //    console.log("dependents of " + file.path + ": " + Object.keys(parents));
  //    return parents;
  //};

  preCompile() {
      layouts.register(handlebars);

      const norm = this.norm;
      const walk = function (dir) {
          var results = [];
          var list = fs.readdirSync(dir);
          list.forEach(function(file) {
              file = sysPath.join(dir, file);
              console.log(dir, file);
              var stat = fs.statSync(file);
              if (stat && stat.isDirectory()) {
                  results = results.concat(walk(file));
              } else {
                  results.push(norm(file));
              }
          });
          return results;
      }

      var nms = walk(this.layoutBaseDir);
      var base = this.layoutBaseDir;
      var basePos = base.length + 1;
      var map = this.partialToPathMap;

      nms.forEach(function (pth) {
          var fnm = pth.substring(basePos);
          var nm = fnm.substring(0, fnm.lastIndexOf("."));
          var content = fs.readFileSync(pth, 'utf8');
          if (content.charCodeAt(0) === 0xFEFF) {
              content = content.slice(1);
          }
          handlebars.registerPartial(nm, content);
          map[nm] = pth;
      });

  }

  norm(path) {
      return path.replace(/\\/g, '/');
  }

  //onCompile(files, assets) {
  //    var registeredPartials = Object.entries(this.partialToPathMap);

  //    console.log(JSON.stringify(registeredPartials));
  //    console.log(JSON.stringify(assets));

  //    const self = this;
  //    assets.forEach(function(f) {
  //        if (f.removed) {
  //            var nm = registeredPartials[f.path];
  //             this.handlebars.unregisterPartial(nm);
  //             delete self.partialsToPathMap(nm);
  //         }
  //    });
  //}

  listDependencies(file) {
      var deps = [];
      var depRe = /{{#(extend|embed)\s+['"]([^\s'"]*)['"]\s*}}/g;
         
      var match;
      while ((match = depRe.exec(file.data)) != null) {
          var partial = match[2];
          var depPath = this.partialToPathMap[partial];
          deps.push(depPath);
      }
      return deps;
  }

  //updateDependencies(file) {

  //  var deps = this.getDependants(file);

  //  if (file.removed) {
  //      this.removeAllDependencies(deps, file.path);
  //  }

  //  var newDeps = this.listDependencies(file);
  //  const self = this;
  //  newDeps.forEach(function(depPath) {
  //      var exists = deps[depPath];
  //      if (exists) {
  //          // no change
  //          delete deps[depPath];
  //      } else {
  //          // add dependency
  //          self.addDependency(file.path, depPath);
  //      }
  //  });

  //  var removals = Object.values(deps);
  //  for (var i = 0; i < removals.length; i++) {
  //      // dependency to remove
  //      var dep = removals[i];
  //      delete dep[file.path];
  //  }
  //}

  //addDependency(objectPath, requiresPath) {
  //    var p = this.dependencies[requiresPath];
  //    if (p === undefined)
  //        p = this.dependencies[requiresPath] = {};
  //    p[objectPath] = true;
  //}

  //removeDependency(objectPath, requiresPath) {
  //    var p = this.dependencies[requiresPath];
  //    if (p === undefined)
  //        p = this.dependencies[requiresPath] = {};
  //    delete p[objectPath];
  //}

  //removeAllDependencies(depsForPath, path) {
  //    var obs = Object.values(depsForPath);
  //    for (var i = 0; i < obs.length; i++) {
  //       delete obs[i][path];
  //    }
  //    delete this.dependencies[path];
  //}

  isPartial(file) {
      return sysPath.resolve(file.path).indexOf(sysPath.resolve(this.layoutBaseDir)) === 0;
  }

  compile(file) {
    const path = file.path;
    let data = file.data;

    try {
      let result;    

      if (this.optimize) {
          data = data.replace(/^[\x20\t]+/mg, '').replace(/[\x20\t]+$/mg, '');
          data = data.replace(/^[\r\n]+/, '').replace(/[\r\n]*$/, '\n');
      }

      const source = `Handlebars.template(${handlebars.precompile(data)})`;
      const ns = this.namespace(path);

      if (ns) {
        // eslint-disable-next-line prefer-template
        const key = ns + '.' + path.replace(/\\/g, '/').replace(this.pathReplace, '').replace(/\..+?$/, '').replace(/\//g, '.');
        result = `Handlebars.initNS( '${key}' ); ${key} = ${source}`;
      } else {
        result = umd(source);
      }

      return Promise.resolve(result);
    } catch (error) {
      return Promise.reject(error);
    }
  }

  compileStatic(file) {
    try {

        //this.updateDependencies(file);

        if (this.isPartial(file)) {
            var basePos = this.layoutBaseDir.length + 1;
            var fnm = this.norm(file.path.substring(basePos));
            var nm = fnm.substring(0, fnm.lastIndexOf("."));
            console.log("hbs-static: register '" + nm + "' as partial");
            if (file.removed) {
                console.log("deletion");
                handlebars.unregisterPartial(nm);
                delete (this.partialToPathMap[nm]);
            } else {
                this.partialToPathMap[nm] = file.path;
                handlebars.registerPartial(nm, file.data);
            }
            return Promise.resolve(file.data);
        }

      const template = handlebars.compile(file.data);
      const source = template(this.locals);

      return Promise.resolve(source);
    } catch (error) {
      return Promise.reject(error);
    }
  }
}

HandlebarsCompiler.prototype.brunchPlugin = true;
HandlebarsCompiler.prototype.type = 'template';
HandlebarsCompiler.prototype.pattern = /\.(hbs|handlebars)$/;
HandlebarsCompiler.prototype.staticTargetExtension = 'html';

module.exports = HandlebarsCompiler;
