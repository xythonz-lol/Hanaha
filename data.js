// data.js - kana table and look-alike groups. Bundled, so it works offline.
// (Stroke order data is in strokes.js.)

// [row name, hiragana, katakana, romaji (space separated), columns used in the 5-wide chart]
const ROWS = [
  ["a",  "あいうえお", "アイウエオ", "a i u e o"],
  ["ka", "かきくけこ", "カキクケコ", "ka ki ku ke ko"],
  ["sa", "さしすせそ", "サシスセソ", "sa shi su se so"],
  ["ta", "たちつてと", "タチツテト", "ta chi tsu te to"],
  ["na", "なにぬねの", "ナニヌネノ", "na ni nu ne no"],
  ["ha", "はひふへほ", "ハヒフヘホ", "ha hi fu he ho"],
  ["ma", "まみむめも", "マミムメモ", "ma mi mu me mo"],
  ["ya", "やゆよ",     "ヤユヨ",     "ya yu yo", [0, 2, 4]],
  ["ra", "らりるれろ", "ラリルレロ", "ra ri ru re ro"],
  ["wa", "わを",       "ワヲ",       "wa wo",    [0, 4]],
  ["n",  "ん",         "ン",         "n",        [0]],
];

// Voiced (dakuten), semi-voiced (handakuten), and contracted (yoon) kana.
// These are shown below the basic gojuon in the chart, in their own sections.
const ROWS_VOICED = [
  ["ga", "がぎぐげご", "ガギグゲゴ", "ga gi gu ge go"],
  ["za", "ざじずぜぞ", "ザジズゼゾ", "za ji zu ze zo"],
  ["da", "だぢづでど", "ダヂヅデド", "da ji zu de do"],
  ["ba", "ばびぶべぼ", "バビブベボ", "ba bi bu be bo"],
  ["pa", "ぱぴぷぺぽ", "パピプペポ", "pa pi pu pe po"],
];

const ROWS_YOON = [
  ["kya", "きゃきゅきょ", "キャキュキョ", "kya kyu kyo"],
  ["sha", "しゃしゅしょ", "シャシュショ", "sha shu sho"],
  ["cha", "ちゃちゅちょ", "チャチュチョ", "cha chu cho"],
  ["nya", "にゃにゅにょ", "ニャニュニョ", "nya nyu nyo"],
  ["hya", "ひゃひゅひょ", "ヒャヒュヒョ", "hya hyu hyo"],
  ["mya", "みゃみゅみょ", "ミャミュミョ", "mya myu myo"],
  ["rya", "りゃりゅりょ", "リャリュリョ", "rya ryu ryo"],
  ["gya", "ぎゃぎゅぎょ", "ギャギュギョ", "gya gyu gyo"],
  ["ja",  "じゃじゅじょ", "ジャジュジョ", "ja ju jo"],
  ["bya", "びゃびゅびょ", "ビャビュビョ", "bya byu byo"],
  ["pya", "ぴゃぴゅぴょ", "ピャピュピョ", "pya pyu pyo"],
];

// Flat list of all characters: {ch, romaji, script, row, col, group}
// group: "basic" | "voiced" | "yoon"
const KANA = [];
function buildKana(table, group) {
  table.forEach(([row, hira, kata, romaji, cols]) => {
    const r = romaji.split(" ");
    // yoon kana are 2-character combinations; iterate by pairs for those
    const hiraChars = group === "yoon" ? hira.match(/../g) : [...hira];
    const kataChars = group === "yoon" ? kata.match(/../g) : [...kata];
    hiraChars.forEach((ch, i) => KANA.push({ ch, romaji: r[i], script: "hira", row, col: cols ? cols[i] : i, group }));
    kataChars.forEach((ch, i) => KANA.push({ ch, romaji: r[i], script: "kata", row, col: cols ? cols[i] : i, group }));
  });
}
buildKana(ROWS, "basic");
buildKana(ROWS_VOICED, "voiced");
buildKana(ROWS_YOON, "yoon");

const KANA_BY_CH = {};
KANA.forEach(k => { KANA_BY_CH[k.ch] = k; });

const WORDS = [
  { kana: "あお", romaji: "ao", meaning: "blue" },
  { kana: "あか", romaji: "aka", meaning: "red" },
  { kana: "いぬ", romaji: "inu", meaning: "dog" },
  { kana: "ねこ", romaji: "neko", meaning: "cat" },
  { kana: "みず", romaji: "mizu", meaning: "water" },
  { kana: "やま", romaji: "yama", meaning: "mountain" },
  { kana: "かわ", romaji: "kawa", meaning: "river" },
  { kana: "そら", romaji: "sora", meaning: "sky" },
  { kana: "はな", romaji: "hana", meaning: "flower" },
  { kana: "つき", romaji: "tsuki", meaning: "moon" },
  { kana: "ほし", romaji: "hoshi", meaning: "star" },
  { kana: "うみ", romaji: "umi", meaning: "sea" },
  { kana: "ひと", romaji: "hito", meaning: "person" },
  { kana: "こども", romaji: "kodomo", meaning: "child" },
  { kana: "ともだち", romaji: "tomodachi", meaning: "friend" },
  { kana: "おちゃ", romaji: "ocha", meaning: "tea" },
  { kana: "すし", romaji: "sushi", meaning: "sushi" },
  { kana: "くるま", romaji: "kuruma", meaning: "car" },
  { kana: "でんしゃ", romaji: "densha", meaning: "train" },
  { kana: "にほん", romaji: "nihon", meaning: "Japan" },
  { kana: "がっこう", romaji: "gakkou", meaning: "school" },
  { kana: "せんせい", romaji: "sensei", meaning: "teacher" },
  { kana: "いち", romaji: "ichi", meaning: "one" },
  { kana: "せき", romaji: "seki", meaning: "seat" },
  { kana: "ありがとう", romaji: "arigatou", meaning: "thank you" },
  { kana: "おはよう", romaji: "ohayou", meaning: "good morning" },
  { kana: "こんばんは", romaji: "konbanwa", meaning: "good evening" },
  { kana: "さくら", romaji: "sakura", meaning: "cherry blossom" },
  { kana: "ゆき", romaji: "yuki", meaning: "snow" },
  { kana: "かぜ", romaji: "kaze", meaning: "wind" }
];

// Look-alike groups, used to make tricky wrong answers in multiple-choice questions
const SIMILAR = ["さち", "ぬめ", "ねれわ", "るろ", "はほ", "まほ", "いり", "こに", "きさ", "あお", "うえ",
                 "シツ", "ソン", "クケ", "ウワ", "アマ", "チテ", "フワ", "コユ", "ノメ", "ヌス", "ミシ", "ソツ"];