// @ts-check

/****************** CONFIG ******************/

/**
 * Default leading added between each character in a ligature
 * For scale, capital letter A is 573 of these units wide.
 * */
const LEADING = 0;

/**
 * If true, produce 2 ligatures for every translation: one for the word all lowercase,
 * and one for the first letter uppercase and the rest lowercase
 */
const DO_CAPITALIZED = true;

/**
 * If true, generates more substitution rules to make word-boundaries work. Will
 * probably force you to lower MAX_LIGS by a factor of 2-3
 */
const DO_WORD_BOUNDARIES = true;

/**
 * Number of ligatures to generate
 * (the number of translations, or if DO_CAPITALIZED is on, twice the number of translations)
 */
const MAX_LIGS = 600;



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
  assert.equal(process.cwd().endsWith('liga-diga'), true);

  // create tmp folder and copy base font source files
  signpost('Creating tmp/Liga-Diga.ufo');
  await fs.remove('./tmp');
  await fs.mkdir('./tmp');
  await fs.copy('./src/Liga-Diga.ufo.base', './tmp/Liga-Diga.ufo');

  let actual_ligs_count = 0;
  /** @type {string[]} */ const contents_inject = [];
  /** @type {string[]} */ const lib_inject = [];
  /** @typedef {{
   *   name: string;
   *   length: number;
   *   fromWithTicks: string;
   *   subRule: string;
   *   leftIgnore: string | null;
   *   rightIgnore: string | null
   * }} Feature */
  /** @type {Feature[]} */ const features = [];

  const glif_template = (await fs.readFile('./src/templates/liga.glif')).toString();

  /** @type {(name: string, from_glyphs: string[], to_glyphs: string[]) => Promise<void>} */
  const doLigature = async (name, from_glyphs, to_glyphs) => {
    actual_ligs_count++;
    contents_inject.push(`<key>${name}</key> <string>${name}.glif</string>`);
    const fromWithTicks = from_glyphs.map(g => `${g}'`).join(' ');
    let leftIgnore = null, rightIgnore = null;
    if (DO_WORD_BOUNDARIES) {
      leftIgnore = `ignore sub @LETTER ${fromWithTicks}; `
      rightIgnore = `ignore sub ${fromWithTicks} @LETTER; `
    }
    features.push({
      name,
      leftIgnore, rightIgnore,
      fromWithTicks,
      length: from_glyphs.length,
      subRule: `sub ${fromWithTicks} by ${name};`,
    });
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
  for (let index = 0; actual_ligs_count < MAX_LIGS; index++) {
    let { done: done1, value: from } = await en.next();
    let { done: done2, value: to } = await es.next();
    if (done1 || done2) break;
    from = from.toLowerCase();
    to = to.toLowerCase();
    if (from === to) continue; // avoid translating a word into itself

    // Our glyph names will be liga_###_lower because I don't trust words in English nor Spanish to be valid file/glyph names

    signpost(`Generating liga_${index} ${from} -> ${to}`, 1);
    /** @type {string[]} */ const from_glyphs_lower = [...from].map((glyph) => GLYPHNAMES[glyph] || glyph);
    /** @type {string[]} */ const to_glyphs_lower = [...to].map((glyph) => GLYPHNAMES[glyph] || glyph);
    await doLigature(`liga_${index}_lower`, from_glyphs_lower, to_glyphs_lower);
    
    if (DO_CAPITALIZED) {
      /** @type {string[]} */ const from_glyphs_capitalized = capitalize([...from]).map((glyph) => GLYPHNAMES[glyph] || glyph);
      /** @type {string[]} */ const to_glyphs_capitalized = capitalize([...to]).map((glyph) => GLYPHNAMES[glyph] || glyph);
      await doLigature(`liga_${index}_capitalized`, from_glyphs_capitalized, to_glyphs_capitalized);
    }
  };
  signpost('Sorting substitution rules');
  // The features.fea spec specifically says you don't have to do this, but FOntMake apparently needs it anyway
  // see http://adobe-type-tools.github.io/afdko/OpenTypeFeatureFileSpecification.html#5d-gsub-lookuptype-4-ligature-substitution
  features.sort((a, b) => b.length - a.length);

  signpost('Removing conflicting IGNORE SUB rules');
  // Algorithmic complexity is not a concern for this personal project
  // I don't expect anyone but me to ever run this, calm down you big-egoed nurd
  if (DO_WORD_BOUNDARIES) {
    for(const feature1 of features) {
      for(const feature2 of features) {
        if (feature1 !== feature2 && feature2.fromWithTicks.includes(feature1.fromWithTicks)) {
          if (!feature2.fromWithTicks.endsWith(feature1.fromWithTicks)) {
            feature1.rightIgnore = null;
          }
          if (!feature2.fromWithTicks.startsWith(feature1.fromWithTicks)) {
            feature1.leftIgnore = null;
          }
        }
      }
    }
  }

  signpost('Generating glyphs/contents.plist');
  const contents_template = (await fs.readFile('./src/templates/contents.plist')).toString();
  const contents_rendered = contents_template.replace('### INJECT ###', contents_inject.join('\n'));
  await fs.writeFile('./tmp/Liga-Diga.ufo/glyphs/contents.plist', contents_rendered);

  signpost('Generating features.fea');
  const features_template = (await fs.readFile('./src/templates/features.fea')).toString();
  const features_rendered = features_template.replace('### INJECT ###', features.map(f => `${f.leftIgnore || ''}${f.rightIgnore || ''}${f.subRule}`).join('\n'));
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
    cp.stderr.on('data', (( /** @type {string} */ chunk) => {
      if(chunk.includes('OTLOffsetOverflowError')) {
        // It doesn't fail for several more steps, but this is a reliable sign that it will
        cp.kill(1);
        console.log(colors.red('OTLOffsetOverflowError: too many ligatures, try lowering MAX_LIGS or fiddling with other settings'));
        process.exit(1);
      }
    }))
  });

  // signpost('Cleaning up tmp');
  // await fs.remove('./tmp');
})();