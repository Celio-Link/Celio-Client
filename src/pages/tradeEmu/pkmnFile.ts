export class PkmnFile {

  private static arrangements = [
    [0, 1, 2, 3], [0, 1, 3, 2], [0, 2, 1, 3], [0, 2, 3, 1], [0, 3, 1, 2], [0, 3, 2, 1],
    [1, 0, 2, 3], [1, 0, 3, 2], [1, 2, 0, 3], [1, 2, 3, 0], [1, 3, 0, 2], [1, 3, 2, 0],
    [2, 0, 1, 3], [2, 0, 3, 1], [2, 1, 0, 3], [2, 1, 3, 0], [2, 3, 0, 1], [2, 3, 1, 0],
    [3, 0, 1, 2], [3, 0, 2, 1], [3, 1, 0, 2], [3, 1, 2, 0], [3, 2, 0, 1], [3, 2, 1, 0]
  ]

  private static speciesMap = new Map<number, [string, number]>([
    [1, ["BULBASAUR", 1]],
    [2, ["IVYSAUR", 2]],
    [3, ["VENUSAUR", 3]],
    [4, ["CHARMANDER", 4]],
    [5, ["CHARMELEON", 5]],
    [6, ["CHARIZARD", 6]],
    [7, ["SQUIRTLE", 7]],
    [8, ["WARTORTLE", 8]],
    [9, ["BLASTOISE", 9]],
    [10, ["CATERPIE", 10]],
    [11, ["METAPOD", 11]],
    [12, ["BUTTERFREE", 12]],
    [13, ["WEEDLE", 13]],
    [14, ["KAKUNA", 14]],
    [15, ["BEEDRILL", 15]],
    [16, ["PIDGEY", 16]],
    [17, ["PIDGEOTTO", 17]],
    [18, ["PIDGEOT", 18]],
    [19, ["RATTATA", 19]],
    [20, ["RATICATE", 20]],
    [21, ["SPEAROW", 21]],
    [22, ["FEAROW", 22]],
    [23, ["EKANS", 23]],
    [24, ["ARBOK", 24]],
    [25, ["PIKACHU", 25]],
    [26, ["RAICHU", 26]],
    [27, ["SANDSHREW", 27]],
    [28, ["SANDSLASH", 28]],
    [29, ["NIDORAN_F", 29]],
    [30, ["NIDORINA", 30]],
    [31, ["NIDOQUEEN", 31]],
    [32, ["NIDORAN_M", 32]],
    [33, ["NIDORINO", 33]],
    [34, ["NIDOKING", 34]],
    [35, ["CLEFAIRY", 35]],
    [36, ["CLEFABLE", 36]],
    [37, ["VULPIX", 37]],
    [38, ["NINETALES", 38]],
    [39, ["JIGGLYPUFF", 39]],
    [40, ["WIGGLYTUFF", 40]],
    [41, ["ZUBAT", 41]],
    [42, ["GOLBAT", 42]],
    [43, ["ODDISH", 43]],
    [44, ["GLOOM", 44]],
    [45, ["VILEPLUME", 45]],
    [46, ["PARAS", 46]],
    [47, ["PARASECT", 47]],
    [48, ["VENONAT", 48]],
    [49, ["VENOMOTH", 49]],
    [50, ["DIGLETT", 50]],
    [51, ["DUGTRIO", 51]],
    [52, ["MEOWTH", 52]],
    [53, ["PERSIAN", 53]],
    [54, ["PSYDUCK", 54]],
    [55, ["GOLDUCK", 55]],
    [56, ["MANKEY", 56]],
    [57, ["PRIMEAPE", 57]],
    [58, ["GROWLITHE", 58]],
    [59, ["ARCANINE", 59]],
    [60, ["POLIWAG", 60]],
    [61, ["POLIWHIRL", 61]],
    [62, ["POLIWRATH", 62]],
    [63, ["ABRA", 63]],
    [64, ["KADABRA", 64]],
    [65, ["ALAKAZAM", 65]],
    [66, ["MACHOP", 66]],
    [67, ["MACHOKE", 67]],
    [68, ["MACHAMP", 68]],
    [69, ["BELLSPROUT", 69]],
    [70, ["WEEPINBELL", 70]],
    [71, ["VICTREEBEL", 71]],
    [72, ["TENTACOOL", 72]],
    [73, ["TENTACRUEL", 73]],
    [74, ["GEODUDE", 74]],
    [75, ["GRAVELER", 75]],
    [76, ["GOLEM", 76]],
    [77, ["PONYTA", 77]],
    [78, ["RAPIDASH", 78]],
    [79, ["SLOWPOKE", 79]],
    [80, ["SLOWBRO", 80]],
    [81, ["MAGNEMITE", 81]],
    [82, ["MAGNETON", 82]],
    [83, ["FARFETCHD", 83]],
    [84, ["DODUO", 84]],
    [85, ["DODRIO", 85]],
    [86, ["SEEL", 86]],
    [87, ["DEWGONG", 87]],
    [88, ["GRIMER", 88]],
    [89, ["MUK", 89]],
    [90, ["SHELLDER", 90]],
    [91, ["CLOYSTER", 91]],
    [92, ["GASTLY", 92]],
    [93, ["HAUNTER", 93]],
    [94, ["GENGAR", 94]],
    [95, ["ONIX", 95]],
    [96, ["DROWZEE", 96]],
    [97, ["HYPNO", 97]],
    [98, ["KRABBY", 98]],
    [99, ["KINGLER", 99]],
    [100, ["VOLTORB", 100]],
    [101, ["ELECTRODE", 101]],
    [102, ["EXEGGCUTE", 102]],
    [103, ["EXEGGUTOR", 103]],
    [104, ["CUBONE", 104]],
    [105, ["MAROWAK", 105]],
    [106, ["HITMONLEE", 106]],
    [107, ["HITMONCHAN", 107]],
    [108, ["LICKITUNG", 108]],
    [109, ["KOFFING", 109]],
    [110, ["WEEZING", 110]],
    [111, ["RHYHORN", 111]],
    [112, ["RHYDON", 112]],
    [113, ["CHANSEY", 113]],
    [114, ["TANGELA", 114]],
    [115, ["KANGASKHAN", 115]],
    [116, ["HORSEA", 116]],
    [117, ["SEADRA", 117]],
    [118, ["GOLDEEN", 118]],
    [119, ["SEAKING", 119]],
    [120, ["STARYU", 120]],
    [121, ["STARMIE", 121]],
    [122, ["MR_MIME", 122]],
    [123, ["SCYTHER", 123]],
    [124, ["JYNX", 124]],
    [125, ["ELECTABUZZ", 125]],
    [126, ["MAGMAR", 126]],
    [127, ["PINSIR", 127]],
    [128, ["TAUROS", 128]],
    [129, ["MAGIKARP", 129]],
    [130, ["GYARADOS", 130]],
    [131, ["LAPRAS", 131]],
    [132, ["DITTO", 132]],
    [133, ["EEVEE", 133]],
    [134, ["VAPOREON", 134]],
    [135, ["JOLTEON", 135]],
    [136, ["FLAREON", 136]],
    [137, ["PORYGON", 137]],
    [138, ["OMANYTE", 138]],
    [139, ["OMASTAR", 139]],
    [140, ["KABUTO", 140]],
    [141, ["KABUTOPS", 141]],
    [142, ["AERODACTYL", 142]],
    [143, ["SNORLAX", 143]],
    [144, ["ARTICUNO", 144]],
    [145, ["ZAPDOS", 145]],
    [146, ["MOLTRES", 146]],
    [147, ["DRATINI", 147]],
    [148, ["DRAGONAIR", 148]],
    [149, ["DRAGONITE", 149]],
    [150, ["MEWTWO", 150]],
    [151, ["MEW", 151]],
    [152, ["CHIKORITA", 152]],
    [153, ["BAYLEEF", 153]],
    [154, ["MEGANIUM", 154]],
    [155, ["CYNDAQUIL", 155]],
    [156, ["QUILAVA", 156]],
    [157, ["TYPHLOSION", 157]],
    [158, ["TOTODILE", 158]],
    [159, ["CROCONAW", 159]],
    [160, ["FERALIGATR", 160]],
    [161, ["SENTRET", 161]],
    [162, ["FURRET", 162]],
    [163, ["HOOTHOOT", 163]],
    [164, ["NOCTOWL", 164]],
    [165, ["LEDYBA", 165]],
    [166, ["LEDIAN", 166]],
    [167, ["SPINARAK", 167]],
    [168, ["ARIADOS", 168]],
    [169, ["CROBAT", 169]],
    [170, ["CHINCHOU", 170]],
    [171, ["LANTURN", 171]],
    [172, ["PICHU", 172]],
    [173, ["CLEFFA", 173]],
    [174, ["IGGLYBUFF", 174]],
    [175, ["TOGEPI", 175]],
    [176, ["TOGETIC", 176]],
    [177, ["NATU", 177]],
    [178, ["XATU", 178]],
    [179, ["MAREEP", 179]],
    [180, ["FLAAFFY", 180]],
    [181, ["AMPHAROS", 181]],
    [182, ["BELLOSSOM", 182]],
    [183, ["MARILL", 183]],
    [184, ["AZUMARILL", 184]],
    [185, ["SUDOWOODO", 185]],
    [186, ["POLITOED", 186]],
    [187, ["HOPPIP", 187]],
    [188, ["SKIPLOOM", 188]],
    [189, ["JUMPLUFF", 189]],
    [190, ["AIPOM", 190]],
    [191, ["SUNKERN", 191]],
    [192, ["SUNFLORA", 192]],
    [193, ["YANMA", 193]],
    [194, ["WOOPER", 194]],
    [195, ["QUAGSIRE", 195]],
    [196, ["ESPEON", 196]],
    [197, ["UMBREON", 197]],
    [198, ["MURKROW", 198]],
    [199, ["SLOWKING", 199]],
    [200, ["MISDREAVUS", 200]],
    [201, ["UNOWN", 201]],
    [202, ["WOBBUFFET", 202]],
    [203, ["GIRAFARIG", 203]],
    [204, ["PINECO", 204]],
    [205, ["FORRETRESS", 205]],
    [206, ["DUNSPARCE", 206]],
    [207, ["GLIGAR", 207]],
    [208, ["STEELIX", 208]],
    [209, ["SNUBBULL", 209]],
    [210, ["GRANBULL", 210]],
    [211, ["QWILFISH", 211]],
    [212, ["SCIZOR", 212]],
    [213, ["SHUCKLE", 213]],
    [214, ["HERACROSS", 214]],
    [215, ["SNEASEL", 215]],
    [216, ["TEDDIURSA", 216]],
    [217, ["URSARING", 217]],
    [218, ["SLUGMA", 218]],
    [219, ["MAGCARGO", 219]],
    [220, ["SWINUB", 220]],
    [221, ["PILOSWINE", 221]],
    [222, ["CORSOLA", 222]],
    [223, ["REMORAID", 223]],
    [224, ["OCTILLERY", 224]],
    [225, ["DELIBIRD", 225]],
    [226, ["MANTINE", 226]],
    [227, ["SKARMORY", 227]],
    [228, ["HOUNDOUR", 228]],
    [229, ["HOUNDOOM", 229]],
    [230, ["KINGDRA", 230]],
    [231, ["PHANPY", 231]],
    [232, ["DONPHAN", 232]],
    [233, ["PORYGON2", 233]],
    [234, ["STANTLER", 234]],
    [235, ["SMEARGLE", 235]],
    [236, ["TYROGUE", 236]],
    [237, ["HITMONTOP", 237]],
    [238, ["SMOOCHUM", 238]],
    [239, ["ELEKID", 239]],
    [240, ["MAGBY", 240]],
    [241, ["MILTANK", 241]],
    [242, ["BLISSEY", 242]],
    [243, ["RAIKOU", 243]],
    [244, ["ENTEI", 244]],
    [245, ["SUICUNE", 245]],
    [246, ["LARVITAR", 246]],
    [247, ["PUPITAR", 247]],
    [248, ["TYRANITAR", 248]],
    [249, ["LUGIA", 249]],
    [250, ["HO_OH", 250]],
    [251, ["CELEBI", 251]],
    [277, ["TREECKO", 252]],
    [278, ["GROVYLE", 253]],
    [279, ["SCEPTILE", 254]],
    [280, ["TORCHIC", 255]],
    [281, ["COMBUSKEN", 256]],
    [282, ["BLAZIKEN", 257]],
    [283, ["MUDKIP", 258]],
    [284, ["MARSHTOMP", 259]],
    [285, ["SWAMPERT", 260]],
    [286, ["POOCHYENA", 261]],
    [287, ["MIGHTYENA", 262]],
    [288, ["ZIGZAGOON", 263]],
    [289, ["LINOONE", 264]],
    [290, ["WURMPLE", 265]],
    [291, ["SILCOON", 266]],
    [292, ["BEAUTIFLY", 267]],
    [293, ["CASCOON", 268]],
    [294, ["DUSTOX", 269]],
    [295, ["LOTAD", 270]],
    [296, ["LOMBRE", 271]],
    [297, ["LUDICOLO", 272]],
    [298, ["SEEDOT", 273]],
    [299, ["NUZLEAF", 274]],
    [300, ["SHIFTRY", 275]],
    [301, ["NINCADA", 290]],
    [302, ["NINJASK", 291]],
    [303, ["SHEDINJA", 292]],
    [304, ["TAILLOW", 276]],
    [305, ["SWELLOW", 297]],
    [306, ["SHROOMISH", 285]],
    [307, ["BRELOOM", 286]],
    [308, ["SPINDA", 327]],
    [309, ["WINGULL", 278]],
    [310, ["PELIPPER", 279]],
    [311, ["SURSKIT", 283]],
    [312, ["MASQUERAIN", 284]],
    [313, ["WAILMER", 320]],
    [314, ["WAILORD", 321]],
    [315, ["SKITTY", 300]],
    [316, ["DELCATTY", 301]],
    [317, ["KECLEON", 352]],
    [318, ["BALTOY", 343]],
    [319, ["CLAYDOL", 344]],
    [320, ["NOSEPASS", 299]],
    [321, ["TORKOAL", 324]],
    [322, ["SABLEYE", 302]],
    [323, ["BARBOACH", 339]],
    [324, ["WHISCASH", 340]],
    [325, ["LUVDISC", 370]],
    [326, ["CORPHISH", 341]],
    [327, ["CRAWDAUNT", 342]],
    [328, ["FEEBAS", 349]],
    [329, ["MILOTIC", 350]],
    [330, ["CARVANHA", 318]],
    [331, ["SHARPEDO", 319]],
    [332, ["TRAPINCH", 328]],
    [333, ["VIBRAVA", 329]],
    [334, ["FLYGON", 330]],
    [335, ["MAKUHITA", 296]],
    [336, ["HARIYAMA", 297]],
    [337, ["ELECTRIKE", 309]],
    [338, ["MANECTRIC", 310]],
    [339, ["NUMEL", 323]],
    [340, ["CAMERUPT", 324]],
    [341, ["SPHEAL", 363]],
    [342, ["SEALEO", 364]],
    [343, ["WALREIN", 365]],
    [344, ["CACNEA", 331]],
    [345, ["CACTURNE", 332]],
    [346, ["SNORUNT", 361]],
    [347, ["GLALIE", 362]],
    [348, ["LUNATONE", 337]],
    [349, ["SOLROCK", 338]],
    [350, ["AZURILL", 298]],
    [351, ["SPOINK", 325]],
    [352, ["GRUMPIG", 326]],
    [353, ["PLUSLE", 311]],
    [354, ["MINUN", 312]],
    [355, ["MAWILE", 303]],
    [356, ["MEDITITE", 307]],
    [357, ["MEDICHAM", 308]],
    [358, ["SWABLU", 333]],
    [359, ["ALTARIA", 334]],
    [360, ["WYNAUT", 360]],
    [361, ["DUSKULL", 355]],
    [362, ["DUSCLOPS", 356]],
    [363, ["ROSELIA", 315]],
    [364, ["SLAKOTH", 287]],
    [365, ["VIGOROTH", 288]],
    [366, ["SLAKING", 289]],
    [367, ["GULPIN", 316]],
    [368, ["SWALOT", 317]],
    [369, ["TROPIUS", 357]],
    [370, ["WHISMUR", 293]],
    [371, ["LOUDRED", 294]],
    [372, ["EXPLOUD", 295]],
    [373, ["CLAMPERL", 366]],
    [374, ["HUNTAIL", 367]],
    [375, ["GOREBYSS", 368]],
    [376, ["ABSOL", 359]],
    [377, ["SHUPPET", 353]],
    [378, ["BANETTE", 354]],
    [379, ["SEVIPER", 336]],
    [380, ["ZANGOOSE", 335]],
    [381, ["RELICANTH", 369]],
    [382, ["ARON", 304]],
    [383, ["LAIRON", 305]],
    [384, ["AGGRON", 306]],
    [385, ["CASTFORM", 351]],
    [386, ["VOLBEAT", 313]],
    [387, ["ILLUMISE", 314]],
    [388, ["LILEEP", 345]],
    [389, ["CRADILY", 346]],
    [390, ["ANORITH", 347]],
    [391, ["ARMALDO", 348]],
    [392, ["RALTS", 280]],
    [393, ["KIRLIA", 281]],
    [394, ["GARDEVOIR", 282]],
    [395, ["BAGON", 371]],
    [396, ["SHELGON", 372]],
    [397, ["SALAMENCE", 373]],
    [398, ["BELDUM", 374]],
    [399, ["METANG", 375]],
    [400, ["METAGROSS", 376]],
    [401, ["REGIROCK", 377]],
    [402, ["REGICE", 378]],
    [403, ["REGISTEEL", 379]],
    [404, ["KYOGRE", 382]],
    [405, ["GROUDON", 383]],
    [406, ["RAYQUAZA", 384]],
    [407, ["LATIAS", 380]],
    [408, ["LATIOS", 381]],
    [409, ["JIRACHI", 385]],
    [410, ["DEOXYS", 386]],
    [411, ["CHIMECHO", 358]],
  ]);

  public pokemonId: number;
  public pokemonName: string;

  private constructor(public decryptedBuffer: Uint8Array, public encryptedBuffer: Uint8Array, public name: string) {
    this.pokemonId = this.getPokemonId();
    this.pokemonName = this.getPokemonName();
  }

  static async fromFile(file: File): Promise<PkmnFile> {

    let decryptedBuffer = new Uint8Array(100);
    let encryptedBuffer = new Uint8Array(100);

    if (file.name.endsWith(".pk3"))
    {
      let buffer = await file.arrayBuffer()
      decryptedBuffer.set(new Uint8Array(buffer))
      this.encryptPkFile(decryptedBuffer, encryptedBuffer);
    }
    else if (file.name.endsWith(".ek3"))
    {
      let buffer = await file.arrayBuffer()
      encryptedBuffer.set(new Uint8Array(buffer))
      this.decryptPkFile(encryptedBuffer, decryptedBuffer);
    }

    return new PkmnFile(decryptedBuffer, encryptedBuffer, file.name);
  }

  private static encryptPkFile(decryptedBuffer: Uint8Array, encryptedBuffer: Uint8Array) {

    let trainerStuff = decryptedBuffer.subarray(0, 32)
    let growth = decryptedBuffer.slice(32, 44)
    let attacks = decryptedBuffer.slice(44, 56)
    let evs = decryptedBuffer.slice(56, 68)
    let misc = decryptedBuffer.slice(68, 80)
    let stats = decryptedBuffer.subarray(80, 100)

    let structures = [growth, attacks, evs, misc]

    const view = new DataView(trainerStuff.buffer, trainerStuff.byteOffset, 8);
    const pid = view.getUint32(0, true);
    const otId = view.getUint32(4, true);

    structures.forEach(structure => {
      const u32 = new Uint32Array(structure.buffer, structure.byteOffset, structure.byteLength / 4);
      for (let i = 0; i < u32.length; i++) {
        u32[i] ^= pid;
        u32[i] ^= otId;
      }
    })

    encryptedBuffer.set(trainerStuff, 0)
    PkmnFile.arrangements[(pid % 24)].forEach((value: number, index: number) => {
      encryptedBuffer.set(structures[value], 32 + (index * 12))
    })
    encryptedBuffer.set(stats, 80)
  }

  private static decryptPkFile(encryptedBuffer: Uint8Array, decryptedBuffer: Uint8Array) {

    let trainerStuff = encryptedBuffer.subarray(0, 32)
    let data0 = encryptedBuffer.slice(32, 44)
    let data1 = encryptedBuffer.slice(44, 56)
    let data2 = encryptedBuffer.slice(56, 68)
    let data3 = encryptedBuffer.slice(68, 80)
    let stats = encryptedBuffer.subarray(80, 100)

    const view = new DataView(trainerStuff.buffer, trainerStuff.byteOffset, 8);
    const pid = view.getUint32(0, true);
    const otId = view.getUint32(4, true);

    let structures = [data0, data1, data2, data3];

    structures.forEach(structure => {
      const u32 = new Uint32Array(structure.buffer, structure.byteOffset, structure.byteLength / 4);
      for (let i = 0; i < u32.length; i++) {
        u32[i] ^= pid;
        u32[i] ^= otId;
      }
    })

    decryptedBuffer.set(trainerStuff, 0)
    PkmnFile.arrangements[(pid % 24)].forEach((value: number, index: number) => {
      decryptedBuffer.set(structures[index], 32 + (value * 12))
    })
    decryptedBuffer.set(stats, 80)
  }

  getPokemonName(): string {
    const view = new DataView(this.decryptedBuffer.buffer, 32, 2);
    const species = PkmnFile.speciesMap.get(view.getUint16(0, true));
    if (!species) return "Unknown";
    return species[0];
  }

  getPokemonId(): number {
    const view = new DataView(this.decryptedBuffer.buffer, 32, 2);
    const species = PkmnFile.speciesMap.get(view.getUint16(0, true));
    if (!species) return 0;
    return species[1];
  }
}
