(function () {
  /*
   * 코드 하이라이트 로더.
   * 커스텀 스킨이 적용되지 않는 환경(모바일/티스토리 앱 등)에서 highlight.js와
   * catppuccin 테마를 불러와 코드 블록을 하이라이트하기 위한 스크립트.
   *
   * PC 커스텀 스킨에는 hljs가 이미 vendor 번들로 들어있어 window.hljs가 전역으로
   * 존재하므로, 그 경우에는 스킨에 위임하고 아무것도 하지 않는다(중복 로드 방지).
   * 앱 환경에는 라이트/다크 토글이 없으므로 라이트(frappe) 테마만 로드한다.
   */
  if (window.__blogHljsLoaded) return;
  window.__blogHljsLoaded = true;

  var HLJS_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/highlight.min.js';
  var THEME_HREF = 'https://mstone8370.github.io/blog-widgets/Script/catppuccin-frappe.css';

  function highlightAll() {
    if (!window.hljs) return;
    // 이미 하이라이트된 블록은 건너뛴다(이중 실행 시 경고 방지).
    document.querySelectorAll('pre code:not([data-highlighted])').forEach(hljs.highlightElement);
  }

  function run() {
    // 스킨이 이미 hljs를 제공(PC)하면 스킨에 위임하고 끝낸다.
    if (window.hljs) return;

    // 테마 CSS 주입 (라이트 = catppuccin frappe)
    if (!document.getElementById('blog-hljs-theme')) {
      var link = document.createElement('link');
      link.id = 'blog-hljs-theme';
      link.rel = 'stylesheet';
      link.href = THEME_HREF;
      document.head.appendChild(link);
    }

    // highlight.js 라이브러리 로드 후 하이라이트 실행
    var script = document.createElement('script');
    script.src = HLJS_SRC;
    script.onload = highlightAll;
    document.head.appendChild(script);
  }

  // deferred 스킨 스크립트(vendor.js)가 먼저 실행되도록 DOMContentLoaded까지 기다린다.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})();

// <script src="https://mstone8370.github.io/blog-widgets/Script/LoadHighlight.js"></script>
