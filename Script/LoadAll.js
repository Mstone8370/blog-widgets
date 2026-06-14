(function () {
  /*
   * 통합 로더: MathJax(수식)와 코드 하이라이트를 한 번에 불러온다.
   * 블로그/글에는 이 스크립트 한 줄만 넣으면 둘 다 적용된다.
   * 실제 로직은 각각 LoadMathJax.js / LoadHighlight.js 에 있으며(단일 출처),
   * 둘 다 멱등(idempotent)이라 중복 포함돼도 안전하다.
   */
  var base = 'https://mstone8370.github.io/blog-widgets/Script/';
  ['LoadMathJax.js', 'LoadHighlight.js'].forEach(function (file) {
    var s = document.createElement('script');
    s.src = base + file;
    document.head.appendChild(s);
  });
})();

// <script src="https://mstone8370.github.io/blog-widgets/Script/LoadAll.js"></script>
