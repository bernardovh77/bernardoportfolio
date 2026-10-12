DOOM on the car console
=======================

This folder holds the original DOOM (id Software, 1993) that runs on the
console screen of the car in the Synth Desert district of this site.

doom.wasm
  Engine: id Software's Linux DOOM 1.10 source code, released by id Software
  under the GNU General Public License version 2. Compiled to WebAssembly,
  unmodified, by Cornelius Diekmann as part of "WebAssembly from Scratch:
  From FizzBuzz to DooM":
    https://github.com/diekmann/wasm-fizzbuzz/tree/main/doom
  The binary was taken as published in the wasm-doom package
  (https://github.com/iam-medvedev/wasm-doom, version 1.2.0), which copies it
  from that project.

  Corresponding source code:
    https://github.com/diekmann/wasm-fizzbuzz/tree/main/doom
    (commit 51a7030bea563d96027301a36619c17347b9270d)
    https://github.com/id-Software/DOOM

  License: GNU General Public License, version 2
    https://www.gnu.org/licenses/old-licenses/gpl-2.0.html

Game data
  The shareware DOOM1.WAD, version 1.9 (Episode 1, "Knee-Deep in the Dead"),
  is built into doom.wasm unmodified
  (MD5 of the WAD: f0cefca49926d00903cf57551d901abe).
  DOOM and the shareware episode are (c) 1993 id Software. The shareware
  episode may be shared freely as long as it is not modified or sold.
  If you like it, the full game is still sold by id Software.

The page code that loads it lives in lib/car/doom.ts.
