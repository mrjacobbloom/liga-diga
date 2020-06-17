// @ts-check

/****************** CONFIG ******************/

/**
 * Default leading added between each character in a ligature
 * */
const LEADING = 0;

/**
 * Maximum number of ligatures to generate
 * It craps out somewhere between 800 and 2000
 * May come out to slightly lower because words that are the same in both languages are skipped
 */
const MAX_LIGS = 800;



const assert = require('assert');
const colors = require('colors/safe');
const { exec } = require('child_process');
const fs = require('fs-extra');
const readline = require('readline');

const { GLYPHNAMES, WIDTHS } = require('./consts.json');

/** @type {(msg: string, depth?: number) => void} */
const signpost = (msg, depth = 0) => console.log(colors.green(`${'  '.repeat(depth)}- ${msg}`));

/** @type {(letters: string[]) => string[]} */
const capitalize = ([first, ...rest]) => [first.toUpperCase(), ...rest];

// Main loop lives in an IIAFE because TLA is no
(async () => {
  // Assert we're running in the src folder so we don't mess with
  // directories we don't own
  assert(process.cwd().endsWith('liga-diga'));

  // create tmp folder and copy base font source files
  signpost('Creating tmp/Liga-Diga.ufo');
  await fs.remove('./tmp');
  await fs.mkdir('./tmp');
  await fs.copy('./src/Liga-Diga.ufo.base', './tmp/Liga-Diga.ufo');

  /** @type {string[]} */ const contents_inject = [];
  /** @type {{ line: string; length: number }[]} */ const features_inject = [];
  /** @type {string[]} */ const lib_inject = [];

  const glif_template = (await fs.readFile('./src/templates/liga.glif')).toString();

  /** @type {(name: string, from_glyphs: string[], to_glyphs: string[]) => Promise<void>} */
  const doLigature = async (name, from_glyphs, to_glyphs) => {
    contents_inject.push(`<key>${name}</key> <string>${name}.glif</string>`);
    features_inject.push({ line: `sub ${from_glyphs.join(' ')} by ${name};`, length: from_glyphs.length });
    lib_inject.push(`<string>${name}</string>`);

    let glif_rendered = glif_template;
    glif_rendered = glif_rendered.replace('### INJECT NAME ###', name);
    let width = 0;
    /** @type {string[]} */ const components = [];
    for (const glyph of to_glyphs) {
      components.push(`<component base="${glyph}" xOffset="${width}"/>`);
      width += WIDTHS[glyph] + LEADING;
    }
    glif_rendered = glif_rendered.replace('### INJECT COMPONENTS ###', components.join('\n'));
    glif_rendered = glif_rendered.replace('### INJECT WIDTH ###', String(width - LEADING));
    await fs.writeFile(`./tmp/Liga-Diga.ufo/glyphs/${name}.glif`, glif_rendered);
  }

  const en = readline.createInterface({ input: fs.createReadStream('./src/en.txt'), crlfDelay: Infinity })[Symbol.asyncIterator]();
  const es = readline.createInterface({ input: fs.createReadStream('./src/es.txt'), crlfDelay: Infinity })[Symbol.asyncIterator]();

  signpost('Generating ligature files and collecting metadata');
  for (let index = 0; index < MAX_LIGS; index++) {
    let { done: done1, value: from } = await en.next();
    let { done: done2, value: to } = await es.next();
    if (done1 || done2) break;
    from = from.toLowerCase();
    to = to.toLowerCase();
    if (from === to) continue; // avoid duplicates, we don't want a noop ligature

    signpost(`Generating liga_${index} ${from} -> ${to}`, 1);
    // I don't trust words in English nor Spanish to be valid file/glyph names
    /** @type {string[]} */ const from_glyphs_lower = [...from].map((glyph) => GLYPHNAMES[glyph] || glyph);
    /** @type {string[]} */ const to_glyphs_lower = [...to].map((glyph) => GLYPHNAMES[glyph] || glyph);
    await doLigature(`liga_${index}_lower`, from_glyphs_lower, to_glyphs_lower);
    
    /** @type {string[]} */ const from_glyphs_capitalized = capitalize([...from]).map((glyph) => GLYPHNAMES[glyph] || glyph);
    /** @type {string[]} */ const to_glyphs_capitalized = capitalize([...to]).map((glyph) => GLYPHNAMES[glyph] || glyph);
    await doLigature(`liga_${index}_capitalized`, from_glyphs_capitalized, to_glyphs_capitalized);
  };

  signpost('Generating glyphs/contents.plist');
  const contents_template = (await fs.readFile('./src/templates/contents.plist')).toString();
  const contents_rendered = contents_template.replace('### INJECT ###', contents_inject.join('\n'));
  await fs.writeFile('./tmp/Liga-Diga.ufo/glyphs/contents.plist', contents_rendered);

  signpost('Generating features.fea');
  // sort for priority
  features_inject.sort((a, b) => b.length - a.length);
  const features_template = (await fs.readFile('./src/templates/features.fea')).toString();
  const features_rendered = features_template.replace('### INJECT ###', features_inject.map(o => o.line).join('\n'));
  await fs.writeFile('./tmp/Liga-Diga.ufo/features.fea', features_rendered);

  signpost('Generating lib.plist');
  const lib_template = (await fs.readFile('./src/templates/lib.plist')).toString();
  const lib_rendered = lib_template.replace('### INJECT ###', lib_inject.join('\n'));
  await fs.writeFile('./tmp/Liga-Diga.ufo/lib.plist', lib_rendered);

  signpost('Running Fontmake');
  await new Promise((res, rej) => {
    // unfortunately promisified exec doesn't have a way to pipe stdout/err
    const cp = exec('npm run fontmake', (err) => (err ? rej(err) : res()));
    cp.stdout.pipe(process.stdout);
    cp.stderr.pipe(process.stderr);
  });

  // signpost('Cleaning up tmp');
  // await fs.remove('./tmp');
})();