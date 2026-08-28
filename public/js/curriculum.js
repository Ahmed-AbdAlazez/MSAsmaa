/**
 * curriculum.js
 * ---------------------------------------------------------------------------
 * Single source of truth for the course structure (chapters + lessons).
 *
 * Lesson IDs follow the convention "lesson-N" (sequential across the whole
 * course). These IDs are what the Bunny Stream title convention uses:
 *     "lesson-N | video name | attachment link | description"
 *
 * Also injects ?lesson=lesson-N into the visible lesson links on the course
 * page so students land on the right video automatically.
 */

window.CURRICULUM = {
  biology: [
    {
      id: 'ch1',
      name: 'الفصل الأول: التركيب والوظيفة في الكائنات الحية',
      icon: '🦴',
      description: 'الدعامة في الكائنات الحية والحركة',
      lessons: [{ id: 'lesson-1', name: 'الدعامة والحركة في الكائنات الحية' }],
    },
    {
      id: 'ch2',
      name: 'الفصل الثاني: التنسيق الهرموني في الكائنات الحية',
      icon: '⚙️',
      description: 'التنسيق الهرموني في الجسم ووظائف الغدد في الإنسان',
      lessons: [
        { id: 'lesson-2', name: 'التنسيق الهرموني في الكائنات الحية' },
        { id: 'lesson-3', name: 'تابع الغدد في الإنسان' },
      ],
    },
    {
      id: 'ch3',
      name: 'الفصل الثالث: التكاثر في الكائنات الحية',
      icon: '🌱',
      description: 'طرق التكاثر في الكائنات الحية والنباتات الزهرية والإنسان',
      lessons: [
        { id: 'lesson-4', name: 'طرق التكاثر في الكائنات الحية' },
        { id: 'lesson-5', name: 'تابع طرق التكاثر في الكائنات الحية' },
        { id: 'lesson-6', name: 'التكاثر في النباتات الزهرية' },
        { id: 'lesson-7', name: 'التكاثر في الإنسان' },
        { id: 'lesson-8', name: 'تابع التكاثر في الإنسان' },
      ],
    },
    {
      id: 'ch4',
      name: 'الفصل الرابع: المناعة في الكائنات الحية',
      icon: '🛡️',
      description: 'المناعة في النبات والإنسان وآلية عمل الجهاز المناعي',
      lessons: [
        { id: 'lesson-9', name: 'المناعة في النبات' },
        { id: 'lesson-10', name: 'المناعة في الإنسان' },
        { id: 'lesson-11', name: 'آلية عمل الجهاز المناعي في الإنسان' },
      ],
    },
    {
      id: 'ch5',
      name: 'الفصل الخامس: الحمض النووي DNA والمعلومات الوراثية',
      icon: '🧬',
      description: 'الحمض النووي DNA والمعلومات الوراثية والمحتوى الجيني والطفرات',
      lessons: [
        { id: 'lesson-12', name: 'الحمض النووي DNA والمعلومات الوراثية' },
        { id: 'lesson-13', name: 'الحمض النووي DNA في أوليات وحقيقيات النواة' },
        { id: 'lesson-14', name: 'تركيب المحتوى الجيني والطفرات' },
      ],
    },
    {
      id: 'ch6',
      name: 'الفصل السادس: الأحماض النووية وتخليق البروتين',
      icon: '🔬',
      description: 'الأحماض النووية، تخليق البروتين، والهندسة الوراثية',
      lessons: [
        { id: 'lesson-15', name: 'RNA وتخليق البروتين' },
        { id: 'lesson-16', name: 'التكنولوجيا الجزيئية والهندسة الوراثية' },
      ],
    },
    {
      id: 'ch7',
      name: 'الفصل السابع: الأحياء وعلوم الأرض',
      icon: '⛰️',
      description: 'علم الجيولوجيا ومكونات الأرض والصخور والمعادن',
      lessons: [
        { id: 'lesson-17', name: 'علم الجيولوجيا ومادة الأرض، مكونات كوكب الأرض' },
        { id: 'lesson-18', name: 'التراكيب الجيولوجية لصخور القشرة الأرضية' },
        { id: 'lesson-19', name: 'المعادن وخواصها الفيزيائية' },
        { id: 'lesson-20', name: 'أنواع الصخور (الصخور النارية)' },
        { id: 'lesson-21', name: 'تابع أنواع الصخور (الرسوبية والمتحولة) ودورة الصخور' },
      ],
    },
  ],
};

/**
 * On course pages: append &lesson=lesson-N to every VISIBLE lesson link,
 * following CURRICULUM order. Hidden legacy sections are skipped.
 */
(function injectLessonParams() {
  const chapters = window.CURRICULUM.biology;
  const allLessons = chapters.flatMap((ch) => ch.lessons);

  // Visible lesson links appear in the same order as CURRICULUM above.
  const visibleLinks = [...document.querySelectorAll('a.lesson-list-item')]
    .filter((link) => link.offsetParent); // skip display:none legacy sections

  visibleLinks.forEach((link, index) => {
    // Skip links that already carry an explicit lesson id (e.g. the
    // "دروس هذا الباب" sidebar links on lesson-view.html) so we never
    // overwrite a chapter-correct one by DOM position.
    const existing = new URL(link.href, window.location.href);
    if (existing.searchParams.get('lesson')) return;

    const lesson = allLessons[index];
    if (!lesson) return;
    const chapter = chapters.find((c) =>
      c.lessons.some((l) => l.id === lesson.id));
    const url = new URL(link.href, window.location.href);
    url.searchParams.set('lesson', lesson.id);
    if (chapter) url.searchParams.set('chapter', chapter.id);
    link.href = url.pathname + '?' + url.searchParams.toString();
  });
})();
