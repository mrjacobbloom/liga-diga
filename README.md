# Liga Diga

![Liga Diga in action](https://raw.githubusercontent.com/mrjacobbloom/liga-diga/master/demo.gif?raw=true)

Liga Diga is a font that uses ligatures to automagically translate the top 300
most common English words into Spanish. Your days of using Google Translate are
over!

Download it here: [Downloads](https://github.com/mrjacobbloom/liga-diga/tree/master/dist)

## How the build process works

`npm start` will run the build process. It works in 3 phases:

1. Copies the source code for a simple base font from `src/Liga-Diga.ufo.base`
   into a temp folder, `tmp/Liga-Diga.ufo`
1. Adds and modifies files in the `tmp` folder to add the ligatures and their
   metadata. Those files are based on templates that live in `src/templates`
1. Uses [Google Fontmake](https://github.com/googlefonts/fontmake) (which is a
   dependency of this project) to compile the source files into .ttf/.otf font
   files.

...all of this logic can be found in `src/index.js`

The build process requires Node >=11.4 because it requires
`readline.Interface[Symbol.asyncIterator]`

## Notes

The font is a very simplified version of Fira Sans Regular. To simplify things
for myself, I've removed all kerning data and most characters that can't easily
be created via US keyboard or that aren't requried for Spanish.

`src/index.js` has some constants you can fiddle with at the top of the file
the most important being the max number of ligatures generated.

The word list was translated in chunks via Google Translate, and then manually
tweaked to remove words with punctuation. It includes over 5000 words, but
Fontmake couldn't handle that many. It exists in this repo as 2 parallel text
files, `en.txt` and `es.txt` where each line represents a word.

## Credits

- Font data is adapted from [Fira Sans](https://github.com/mozilla/Fira) by
  Mozilla
- Requires [Google Fontmake](https://github.com/googlefonts/fontmake)
- English wordlist from [this repo](https://github.com/first20hours/google-10000-english),
  specifically `google-10000-english-usa.txt`