// Fortune cookie slip data.
//
// Format conventions are taken from real slips; see references/NOTES-fortunes.md
// for sources. Short version (modern Wonton Food style, the most common US slip):
//   FRONT: the fortune, centered, 2-3 lines, sentence case, usually ending in a
//          period, then (on most slips) "Lucky Numbers 23, 22, 18, 36, 38, 47".
//   BACK:  the Learn Chinese lesson: English word, then each traditional
//          character followed by its tone-marked pinyin in parentheses, e.g.
//          "银 (yín) 行 (háng)". Some slips move the Lucky Numbers here.
// No dependencies. Plain ES module.

// ---------------------------------------------------------------------------
// Fortunes, grouped by category. The mix roughly follows real slips.
// Every line is original or a public-domain proverb, 90 characters or fewer.
// ---------------------------------------------------------------------------

const PROPHECY = [
  'You will soon discover a hidden gem in your own neighborhood.',
  'A new opportunity will knock on your door before the month ends.',
  'Good news will come to you from far away.',
  'You will soon discover a talent you did not know you had.',
  'A small act of kindness will return to you tenfold.',
  'The effort you are putting in now will soon bear fruit.',
  'An unexpected journey will bring you great joy.',
  'You will make a new friend where you least expect it.',
  'Something you lost will soon turn up in a surprising place.',
  'A letter or message will bring you happy news this week.',
  'Soon you will be celebrating a well-earned success.',
  'You will be invited to an exciting event. Say yes.',
  'Your patience will be rewarded in the coming weeks.',
  'A thrilling time is in your immediate future.',
  'Laughter and good company will fill your coming weekend.',
  'The next full moon will bring you a fresh start.',
  'A pleasant change is coming to your home.',
  'You will be recognized for a job well done.',
  'A wish you made long ago is closer to coming true than you think.',
  'A chance meeting will open a new door for you.',
  'Good fortune will follow you through the rest of the year.',
  'You will soon travel to a place you have always wanted to see.',
  'Someone from your past will reach out with good news.',
  'Your talents will be noticed by someone important.',
  'A new hobby will bring you years of happiness.',
  'This year your garden of friendships will bloom.',
  'You will soon find the answer you have been looking for.',
  'An old idea of yours will find new life very soon.',
  'Money will arrive from an unexpected source.',
  'Within the week you will share a wonderful meal with friends.',
  'You will be the center of attention at a happy gathering.',
  'The road ahead is bright. You will walk it with confidence.',
  'Your efforts this season will bring a rich harvest.',
  'A generous offer is headed your way. Consider it carefully.',
  'You will soon learn something that changes your point of view.',
  'Luck is on your side this month. Make good use of it.',
  'A dream you had almost forgotten will soon return.',
  'You will receive a compliment that makes your whole day.',
  'A special person will soon brighten your life.',
  'Before long, today\'s troubles will seem small and far away.',
  'You will enjoy an evening of great conversation this week.',
  'A good deed you did long ago will come back to reward you.',
  'Your home will be filled with happiness in the coming months.',
  'You will soon be offered a chance to lead. Take it.',
  'You will soon give a small gift that means a great deal.',
  'Tomorrow will bring a welcome surprise.',
  'You will find happiness in a simple afternoon.',
  'Soon you will see a familiar place with fresh eyes.',
  'A conversation with a stranger will brighten your week.',
  'Your next adventure is closer than you think.',
  'An exciting opportunity will arrive disguised as hard work.',
  'You will be rewarded for your honesty.',
  'The coming year will be full of pleasant firsts.',
  'Your creativity will lead you to a happy discovery.',
  'A long-awaited answer is on its way to you.',
  'You will soon have a reason to celebrate.',
  'A phone call will bring you welcome news.',
  'You will find the courage to do what you have been putting off.',
  'Good things are already on their way to you.',
  'Your kindness will open a door that effort alone could not.',
  'You will soon receive a gift that money cannot buy.',
  'A lucky coincidence will make you smile this week.',
  'You will be asked for your advice. Your answer will matter.',
  'The stars are lining up in your favor.',
  'A sunny day this week will feel especially lucky.',
  'New friends and new places are in your near future.',
  'Your quiet dedication will soon be noticed.',
  'Something wonderful is waiting just around the corner.',
  'You will solve an old problem in a brand new way.',
  'A happy reunion is in your future.',
  'Soon you will look back on this week and laugh.',
  'You will discover a favorite new place to eat.',
  'Your luck improves with every step you take forward.',
  'A promise made to you will be kept.',
  'You will soon be handed the key to a new opportunity.',
  'A small change in routine will lead to a big discovery.',
  'You will find joy in helping someone this week.',
  'Your future is as bright as your smile.',
  'You will soon master something that once seemed difficult.',
  'Success is coming. Leave the porch light on.',
  'You will receive good news on a rainy day.',
  'A friend will soon invite you on an adventure.',
  'Your next idea will be your best one yet!',
  'An old friend is thinking of you right now.',
  'You will soon be the reason someone smiles.',
  'Great news about an old project is coming soon.',
]

const ADVICE = [
  'Take the scenic route today. You will be glad you did.',
  'Listen more than you speak, and you will learn much.',
  'A kind word costs nothing and is worth a great deal.',
  'Do not wait for the perfect moment. Make this one count.',
  'Every expert was once a beginner. Keep going.',
  'Be patient with yourself. Growth takes time.',
  'Say yes to something new this week.',
  'Share your ideas freely; they grow when shared.',
  'Keep your promises, and others will keep theirs.',
  'A clear mind is the best compass.',
  'Start the day with a smile and see what follows.',
  'Write down your dreams. They are plans in disguise.',
  'Rest is part of the journey, not a detour from it.',
  'Be generous with praise and careful with criticism.',
  'Clear out one old thing today and make room for something new.',
  'Ask the question. The answer may surprise you.',
  'Let go of what you cannot change and embrace what you can.',
  'Be kind to strangers; some of them are future friends.',
  'Every mistake is a lesson wearing a disguise.',
  'Make time for the people who make time for you.',
  'Plan carefully, then act boldly.',
  'Organize your desk and your thoughts will follow.',
  'Call someone you have not spoken to in a while.',
  'Do one thing today that your future self will thank you for.',
  'Trust your instincts. They know the way.',
  'A good friend is worth more than a full wallet.',
  'Hard work and good humor make a winning team.',
  'Speak kindly to yourself. You are always listening.',
  'When in doubt, choose the path that helps you grow.',
  'Try something you have never tried before.',
  'Celebrate small victories. They add up.',
  'Good things take time. So does a good soup.',
  'Keep your eyes on the horizon and your feet on the path.',
  'Honesty is the best foundation for any friendship.',
  'Give your full attention to the task at hand.',
  'Leave every place a little better than you found it.',
  'Take a deep breath. You have handled harder things before.',
  'Be curious. Every question is a small adventure.',
  'Offer help before it is asked for.',
  'Good manners will take you further than a fast car.',
  'Slow down and enjoy your meal. The rest can wait.',
  'Your time is precious. Spend some of it doing nothing at all.',
  'Walk as if you are expected somewhere wonderful.',
  'Keep learning. The mind is a garden that loves to grow.',
  'Do what you love, and love what you do.',
  'Look for the lesson hidden in every setback.',
  'Be the first to say hello.',
  'Turn your worries into plans.',
  'Small daily improvements lead to big results.',
  'Choose your words the way you would choose a gift.',
  'Remember to thank the people who helped you get here.',
  'A cheerful heart makes light work of any task.',
  'Save a little, share a little, enjoy a little.',
  'Take pride in your work, no matter how small the task.',
  'Stay open to new ideas; they often arrive quietly.',
  'Believe in yourself as much as your friends believe in you.',
  'The right time to begin is today.',
  'Find the humor in every situation. It helps.',
  'Listen to your elders; they have walked this road before.',
  'Balance work and play, and both will improve.',
  'Look up from your screen. Something wonderful is nearby.',
  'Keep a little room in your plans for surprises.',
  'Forgive quickly and laugh often.',
  'Be steady like the mountain and flexible like the bamboo.',
  'When the path is unclear, take the next small step.',
  'Practice gratitude and watch your fortune grow.',
  'Take a walk after dinner. Good ideas like fresh air.',
  'Pay attention to the little details today.',
  'Welcome change as you would welcome an old friend.',
  'Do not rush a good thing.',
  'A goal shared with a friend is twice as easy to reach.',
  'Finish what you started, and then start something new.',
]

const COMPLIMENT = [
  'You are a natural leader, and others are happy to follow.',
  'Your warm smile makes strangers feel at home.',
  'You have a gift for making people laugh.',
  'You are more capable than you give yourself credit for.',
  'People trust you because you keep your word.',
  'Your kindness is noticed more often than you think.',
  'You have a sharp mind and a generous heart.',
  'You are wise beyond your years.',
  'Your creativity inspires the people you work with.',
  'You bring out the best in the people you meet.',
  'Your enthusiasm lifts the spirits of everyone nearby.',
  'You are a loyal friend and a good listener.',
  'Your patience is a quiet kind of strength.',
  'You are admired for your honesty and good judgment.',
  'You have the rare ability to see both sides of a story.',
  'Your curiosity is one of your greatest strengths.',
  'You have a talent for turning ordinary days into adventures.',
  'You make difficult things look easy.',
  'Your calm presence puts others at ease.',
  'You are someone people are glad to know.',
  'You are stronger than you realize.',
  'Your ideas have a way of making things better.',
  'You have an eye for beauty in everyday things.',
  'You are a person of great charm and good taste.',
  'Your sense of humor is a gift to everyone who knows you.',
  'You are thoughtful, and it shows in everything you do.',
  'You have a way with words that people remember.',
  'Your determination is truly admirable.',
  'You light up every room you enter.',
  'You are the kind of friend everyone hopes to have.',
  'Your generosity always finds its way back to you.',
  'You are an excellent judge of character.',
  'You have a quiet confidence that others admire.',
  'Your good nature is your greatest treasure.',
  'You are full of pleasant surprises.',
  'You see the world with the eyes of an artist.',
]

// Public-domain sayings in common English renderings: Confucius (Analects),
// Lao Tzu (Tao Te Ching), and traditional Chinese proverbs.
const PROVERB = [
  'A journey of a thousand miles begins with a single step.',
  'It does not matter how slowly you go, as long as you do not stop.',
  'The best time to plant a tree was twenty years ago. The next best time is now.',
  'When you drink water, remember its source.',
  'Failure is the mother of success.',
  'Knowing others is wisdom; knowing yourself is enlightenment.',
  'He who conquers others is strong; he who conquers himself is mighty.',
  'Be not afraid of growing slowly; be afraid only of standing still.',
  'Teachers open the door, but you must enter by yourself.',
  'Talk does not cook rice.',
  'The gem cannot be polished without friction, nor a person perfected without trials.',
  'Nature does not hurry, yet everything is accomplished.',
  'To see what is right and not do it is a want of courage.',
  'Wherever you go, go with all your heart.',
  'Our greatest glory is not in never falling, but in rising every time we fall.',
  'One generation plants the trees; the next enjoys the shade.',
  'Dig the well before you are thirsty.',
  'Three cobblers with their wits combined equal one mastermind.',
  'A book holds a house of gold.',
  'If you want to know the road ahead, ask those coming back.',
  'Learning is a treasure that follows its owner everywhere.',
  'The one who moves a mountain begins by carrying away small stones.',
  'Dripping water wears through stone.',
  'Do not do to others what you would not want done to yourself.',
  'When three people walk together, one of them can be my teacher.',
  'The palest ink is better than the best memory.',
]

// Gentle, meta or restaurant humor. Nothing at anyone's expense.
const HUMOR = [
  'Help! I am being held captive in a fortune cookie bakery.',
  'The fortune you seek is in another cookie. Keep cracking.',
  'Disregard your previous fortune. This one is much better.',
  'You will be hungry again in about an hour.',
  'A cookie never lies. Well, almost never.',
  'Today\'s lucky side dish: one more egg roll.',
  'Someone is about to take the last dumpling. Act fast!',
  'You have excellent taste, as tonight\'s order clearly proves.',
  'Your leftovers will taste even better tomorrow.',
  'Do not fear the spicy sauce. Fear running out of rice.',
  'Good things come to those who order dessert.',
  'This fortune was written by a very wise cookie.',
  'Sharing is caring, but this cookie is all yours.',
  'Reading your fortune aloud doubles the luck. Try it now.',
  'You will find a forgotten snack in your pocket. It was meant to be.',
  'Everything looks better after a bowl of noodles.',
  'A wise person reads the fortune before eating the cookie.',
  'Laugh at your own jokes. Someone has to start.',
  'You have a heart as big as your appetite.',
  'The chopsticks are not the problem. Keep practicing.',
  'You will soon be asked to split the check. Smile anyway.',
  'Congratulations! You cracked it. The cookie, that is.',
  'Tonight\'s forecast: a one hundred percent chance of leftovers.',
  'You will always have room for one more cookie.',
  'This cookie is the lucky one. The last one was just practice.',
  'The early bird gets the worm, but the patient diner gets dessert.',
]

export const FORTUNES_BY_CATEGORY = Object.freeze({
  prophecy: PROPHECY,
  advice: ADVICE,
  compliment: COMPLIMENT,
  proverb: PROVERB,
  humor: HUMOR,
})

export const FORTUNES = Object.freeze([
  ...PROPHECY,
  ...ADVICE,
  ...COMPLIMENT,
  ...PROVERB,
  ...HUMOR,
])

// ---------------------------------------------------------------------------
// Learn Chinese entries.
// US slips print simplified characters; this app uses traditional ones (by
// request), in the same layout: each character is followed by
// its tone-marked pinyin in parentheses: 朋 (péng) 友 (you). `py` therefore has
// exactly one space-separated syllable per character in `zh`, so the app can
// pair them up. Tones follow CC-CEDICT; neutral-tone syllables have no mark.
// ---------------------------------------------------------------------------

export const LEARN_CHINESE = Object.freeze([
  // Food and the restaurant
  { en: 'Tea', zh: '茶', py: 'chá' },
  { en: 'Rice', zh: '米飯', py: 'mǐ fàn' },
  { en: 'Noodles', zh: '麵條', py: 'miàn tiáo' },
  { en: 'Dumplings', zh: '餃子', py: 'jiǎo zi' },
  { en: 'Wonton', zh: '餛飩', py: 'hún tun' },
  { en: 'Egg roll', zh: '春捲', py: 'chūn juǎn' },
  { en: 'Fried rice', zh: '炒飯', py: 'chǎo fàn' },
  { en: 'Chow mein', zh: '炒麵', py: 'chǎo miàn' },
  { en: 'Tofu', zh: '豆腐', py: 'dòu fu' },
  { en: 'Soy sauce', zh: '醬油', py: 'jiàng yóu' },
  { en: 'Soup', zh: '湯', py: 'tāng' },
  { en: 'Chopsticks', zh: '筷子', py: 'kuài zi' },
  { en: 'Chicken', zh: '雞肉', py: 'jī ròu' },
  { en: 'Beef', zh: '牛肉', py: 'niú ròu' },
  { en: 'Pork', zh: '豬肉', py: 'zhū ròu' },
  { en: 'Fish', zh: '魚', py: 'yú' },
  { en: 'Egg', zh: '雞蛋', py: 'jī dàn' },
  { en: 'Vegetable', zh: '蔬菜', py: 'shū cài' },
  { en: 'Watermelon', zh: '西瓜', py: 'xī guā' },
  { en: 'Apple', zh: '蘋果', py: 'píng guǒ' },
  { en: 'Banana', zh: '香蕉', py: 'xiāng jiāo' },
  { en: 'Orange', zh: '橙子', py: 'chéng zi' },
  { en: 'Mango', zh: '芒果', py: 'máng guǒ' },
  { en: 'Strawberry', zh: '草莓', py: 'cǎo méi' },
  { en: 'Peach', zh: '桃子', py: 'táo zi' },
  { en: 'Milk', zh: '牛奶', py: 'niú nǎi' },
  { en: 'Water', zh: '水', py: 'shuǐ' },
  { en: 'Sugar', zh: '糖', py: 'táng' },
  { en: 'Coffee', zh: '咖啡', py: 'kā fēi' },
  { en: 'Bread', zh: '麵包', py: 'miàn bāo' },
  { en: 'Ice cream', zh: '冰淇淋', py: 'bīng qí lín' },
  { en: 'Cookie', zh: '餅乾', py: 'bǐng gān' },
  { en: 'Fortune cookie', zh: '幸運餅乾', py: 'xìng yùn bǐng gān' },
  { en: 'Delicious', zh: '好吃', py: 'hǎo chī' },
  { en: 'Restaurant', zh: '餐廳', py: 'cān tīng' },
  { en: 'Menu', zh: '菜單', py: 'cài dān' },
  { en: 'Breakfast', zh: '早飯', py: 'zǎo fàn' },
  { en: 'Dinner', zh: '晚飯', py: 'wǎn fàn' },
  { en: 'Chef', zh: '廚師', py: 'chú shī' },
  { en: 'Cheers', zh: '乾杯', py: 'gān bēi' },
  { en: 'To eat', zh: '吃', py: 'chī' },
  { en: 'To drink', zh: '喝', py: 'hē' },

  // Greetings and phrases
  { en: 'Hello', zh: '你好', py: 'nǐ hǎo' },
  { en: 'Thank you', zh: '謝謝', py: 'xiè xie' },
  { en: 'Goodbye', zh: '再見', py: 'zài jiàn' },
  { en: 'Excuse me', zh: '勞駕', py: 'láo jià' },
  { en: 'Welcome', zh: '歡迎', py: 'huān yíng' },
  { en: 'Congratulations', zh: '恭喜', py: 'gōng xǐ' },
  { en: 'No problem', zh: '沒問題', py: 'méi wèn tí' },
  { en: 'Go for it', zh: '加油', py: 'jiā yóu' },
  { en: 'Happy birthday', zh: '生日快樂', py: 'shēng rì kuài lè' },
  { en: 'Happy New Year', zh: '新年快樂', py: 'xīn nián kuài lè' },

  // People
  { en: 'Friend', zh: '朋友', py: 'péng you' },
  { en: 'Family', zh: '家庭', py: 'jiā tíng' },
  { en: 'Mother', zh: '母親', py: 'mǔ qīn' },
  { en: 'Father', zh: '父親', py: 'fù qīn' },
  { en: 'Children', zh: '孩子', py: 'hái zi' },
  { en: 'Girl', zh: '女孩', py: 'nǚ hái' },
  { en: 'Boy', zh: '男孩', py: 'nán hái' },
  { en: 'Teacher', zh: '老師', py: 'lǎo shī' },
  { en: 'Student', zh: '學生', py: 'xué sheng' },
  { en: 'Doctor', zh: '醫生', py: 'yī shēng' },

  // Time and seasons
  { en: 'Today', zh: '今天', py: 'jīn tiān' },
  { en: 'Tomorrow', zh: '明天', py: 'míng tiān' },
  { en: 'Yesterday', zh: '昨天', py: 'zuó tiān' },
  { en: 'Weekend', zh: '週末', py: 'zhōu mò' },
  { en: 'Spring', zh: '春天', py: 'chūn tiān' },
  { en: 'Summer', zh: '夏天', py: 'xià tiān' },
  { en: 'Autumn', zh: '秋天', py: 'qiū tiān' },
  { en: 'Winter', zh: '冬天', py: 'dōng tiān' },
  { en: 'January', zh: '一月', py: 'yī yuè' },
  { en: 'August', zh: '八月', py: 'bā yuè' },
  { en: 'Birthday', zh: '生日', py: 'shēng rì' },
  { en: 'Spring Festival', zh: '春節', py: 'Chūn jié' },

  // Nature and animals
  { en: 'Moon', zh: '月亮', py: 'yuè liang' },
  { en: 'Sun', zh: '太陽', py: 'tài yang' },
  { en: 'Star', zh: '星星', py: 'xīng xing' },
  { en: 'To rain', zh: '下雨', py: 'xià yǔ' },
  { en: 'Snow', zh: '雪', py: 'xuě' },
  { en: 'Flower', zh: '花', py: 'huā' },
  { en: 'Tree', zh: '樹', py: 'shù' },
  { en: 'Mountain', zh: '山', py: 'shān' },
  { en: 'Ocean', zh: '大海', py: 'dà hǎi' },
  { en: 'Butterfly', zh: '蝴蝶', py: 'hú dié' },
  { en: 'Panda', zh: '熊貓', py: 'xióng māo' },
  { en: 'Cat', zh: '貓', py: 'māo' },
  { en: 'Dog', zh: '狗', py: 'gǒu' },
  { en: 'Dragon', zh: '龍', py: 'lóng' },
  { en: 'Tiger', zh: '老虎', py: 'lǎo hǔ' },
  { en: 'Rabbit', zh: '兔子', py: 'tù zi' },
  { en: 'Horse', zh: '馬', py: 'mǎ' },
  { en: 'Bird', zh: '鳥', py: 'niǎo' },

  // Good things
  { en: 'Love', zh: '愛', py: 'ài' },
  { en: 'Good luck', zh: '好運', py: 'hǎo yùn' },
  { en: 'Lucky', zh: '幸運', py: 'xìng yùn' },
  { en: 'Happiness', zh: '幸福', py: 'xìng fú' },
  { en: 'Good fortune', zh: '福', py: 'fú' },
  { en: 'Peace', zh: '和平', py: 'hé píng' },
  { en: 'Wisdom', zh: '智慧', py: 'zhì huì' },
  { en: 'Patience', zh: '耐心', py: 'nài xīn' },
  { en: 'Success', zh: '成功', py: 'chéng gōng' },
  { en: 'Dream', zh: '夢想', py: 'mèng xiǎng' },
  { en: 'Hope', zh: '希望', py: 'xī wàng' },
  { en: 'Courage', zh: '勇氣', py: 'yǒng qì' },
  { en: 'Smile', zh: '微笑', py: 'wēi xiào' },
  { en: 'Happy', zh: '快樂', py: 'kuài lè' },
  { en: 'Beautiful', zh: '美麗', py: 'měi lì' },
  { en: 'Gift', zh: '禮物', py: 'lǐ wù' },
  { en: 'Money', zh: '錢', py: 'qián' },
  { en: 'Heart', zh: '心', py: 'xīn' },
  { en: 'Music', zh: '音樂', py: 'yīn yuè' },
  { en: 'Travel', zh: '旅行', py: 'lǚ xíng' },
  { en: 'Red', zh: '紅色', py: 'hóng sè' },
  { en: 'Golden', zh: '金色', py: 'jīn sè' },
  { en: 'Blue', zh: '藍色', py: 'lán sè' },
  { en: 'Red envelope', zh: '紅包', py: 'hóng bāo' },
  { en: 'Lantern', zh: '燈籠', py: 'dēng lóng' },

  // Places and things
  { en: 'Bank', zh: '銀行', py: 'yín háng' },
  { en: 'Post office', zh: '郵局', py: 'yóu jú' },
  { en: 'School', zh: '學校', py: 'xué xiào' },
  { en: 'Library', zh: '圖書館', py: 'tú shū guǎn' },
  { en: 'Park', zh: '公園', py: 'gōng yuán' },
  { en: 'Home', zh: '家', py: 'jiā' },
  { en: 'China', zh: '中國', py: 'Zhōng guó' },
  { en: 'Book', zh: '書', py: 'shū' },
  { en: 'Telephone', zh: '電話', py: 'diàn huà' },
  { en: 'Computer', zh: '電腦', py: 'diàn nǎo' },
  { en: 'Train', zh: '火車', py: 'huǒ chē' },
  { en: 'Airplane', zh: '飛機', py: 'fēi jī' },
  { en: 'Bicycle', zh: '自行車', py: 'zì xíng chē' },
  { en: 'Umbrella', zh: '雨傘', py: 'yǔ sǎn' },
  { en: 'Map', zh: '地圖', py: 'dì tú' },
  { en: 'Key', zh: '鑰匙', py: 'yào shi' },

  // Everyday verbs
  { en: 'To study', zh: '學習', py: 'xué xí' },
  { en: 'To sleep', zh: '睡覺', py: 'shuì jiào' },
  { en: 'To laugh', zh: '笑', py: 'xiào' },
  { en: 'To rest', zh: '休息', py: 'xiū xi' },
  { en: 'Work', zh: '工作', py: 'gōng zuò' },
])

// ---------------------------------------------------------------------------
// Lucky numbers
// ---------------------------------------------------------------------------

// The convention on real slips (523 photographed slips, see notes):
// - six numbers per slip (273 of 277 slips that had numbers)
// - distinct, drawn from 1 to 56 (the highest number seen on Wonton-style slips
//   was 56; 1 to 56 matches the Mega Millions main-ball range of that era)
// - printed in the order they were drawn, so usually NOT sorted. About 1 in 4
//   Wonton-style slips happened to show them in ascending order.
// - printed on one line as "Lucky Numbers 6, 40, 50, 28, 2, 42": comma plus
//   space, no leading zeros, "Lucky Numbers" label with no colon.
export const LUCKY_NUMBERS = Object.freeze({
  count: 6,
  min: 1,
  max: 56,
  sortedChance: 0.24,
  label: 'Lucky Numbers',
  separator: ', ',
})

export const LEARN_CHINESE_LABEL = 'LEARN CHINESE'

// Turns an rng() value in [0, 1) into an integer in [0, n).
function pick(rng, n) {
  return Math.min(n - 1, Math.floor(rng() * n))
}

export function luckyNumbers(rng = Math.random) {
  const { count, min, max, sortedChance } = LUCKY_NUMBERS
  const pool = []
  for (let n = min; n <= max; n++) pool.push(n)
  // Partial Fisher-Yates shuffle: the first `count` slots are a fair draw
  // without replacement, in the order the numbers were drawn.
  for (let i = 0; i < count; i++) {
    const j = i + pick(rng, pool.length - i)
    const tmp = pool[i]
    pool[i] = pool[j]
    pool[j] = tmp
  }
  const nums = pool.slice(0, count)
  if (rng() < sortedChance) nums.sort((a, b) => a - b)
  return nums
}

// ---------------------------------------------------------------------------
// Drawing a whole slip
// ---------------------------------------------------------------------------

// drawFortune avoids any fortune among the last RECENT_WINDOW texts in `recent`.
export const RECENT_WINDOW = 60

export function drawFortune(rng = Math.random, recent = []) {
  const avoid = new Set(recent.slice(-RECENT_WINDOW))
  let pool = FORTUNES.filter((f) => !avoid.has(f))
  if (pool.length === 0) pool = FORTUNES
  return {
    text: pool[pick(rng, pool.length)],
    numbers: luckyNumbers(rng),
    learn: LEARN_CHINESE[pick(rng, LEARN_CHINESE.length)],
  }
}
