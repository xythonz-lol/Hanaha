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

const PRONUNCIATION_FILES = new Set([
  "a", "chi", "e", "fu", "ha", "he", "hi", "ho", "i", "ka", "ke", "ki", "ko", "ku",
  "ma", "me", "mi", "mo", "mu", "n", "na", "ne", "ni", "no", "nu", "o", "ra", "re",
  "ri", "ro", "ru", "sa", "se", "shi", "so", "su", "ta", "te", "to", "tsu", "u",
  "wa", "wo", "ya", "yo", "yu", "ba", "be", "bi", "bo", "bu", "da", "de", "do",
  "ga", "ge", "gi", "go", "gu", "ji", "pa", "pe", "pi", "po", "pu", "za", "ze",
  "zo", "zu", "bya", "byo", "byu", "cha", "cho", "chu", "gya", "gyo", "gyu",
  "hya", "hyo", "hyu",
  "ja", "jo", "ju", "kya", "kyo", "kyu", "mya", "myo", "myu", "nya", "nyo", "nyu",
  "pya", "pyo", "pyu", "rya", "ryo", "ryu", "sha", "sho", "shu"
]);

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

const KATAKANA_WORDS = [
  { kana: "アイス", romaji: "aisu", meaning: "ice cream" },
  { kana: "コーヒー", romaji: "koohii", meaning: "coffee" },
  { kana: "テレビ", romaji: "terebi", meaning: "television" },
  { kana: "カメラ", romaji: "kamera", meaning: "camera" },
  { kana: "ホテル", romaji: "hoteru", meaning: "hotel" },
  { kana: "バス", romaji: "basu", meaning: "bus" },
  { kana: "タクシー", romaji: "takushii", meaning: "taxi" },
  { kana: "ピアノ", romaji: "piano", meaning: "piano" },
  { kana: "ギター", romaji: "gitaa", meaning: "guitar" },
  { kana: "トマト", romaji: "tomato", meaning: "tomato" },
  { kana: "パン", romaji: "pan", meaning: "bread" },
  { kana: "レモン", romaji: "remon", meaning: "lemon" },
  { kana: "チーズ", romaji: "chiizu", meaning: "cheese" },
  { kana: "ジュース", romaji: "juusu", meaning: "juice" },
  { kana: "ケーキ", romaji: "keeki", meaning: "cake" },
  { kana: "バナナ", romaji: "banana", meaning: "banana" },
  { kana: "オレンジ", romaji: "orenji", meaning: "orange" },
  { kana: "メニュー", romaji: "menyuu", meaning: "menu" },
  { kana: "ゲーム", romaji: "geemu", meaning: "game" },
  { kana: "カレー", romaji: "karee", meaning: "curry" },
  { kana: "エアコン", romaji: "eakon", meaning: "air conditioner" },
  { kana: "コンピューター", romaji: "konpyuutaa", meaning: "computer" }
];

// Look-alike groups, used to make tricky wrong answers in multiple-choice questions
const SIMILAR = ["さち", "ぬめ", "ねれわ", "るろ", "はほ", "まほ", "いり", "こに", "きさ", "あお", "うえ",
                 "シツ", "ソン", "クケ", "ウワ", "アマ", "チテ", "フワ", "コユ", "ノメ", "ヌス", "ミシ", "ソツ"];