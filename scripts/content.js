(function () {
  "use strict";
  // dom 引用
  let wrapper = null;
  let content = null;
  let contentText = null;
  let contentIframe = null;
  let scrollbarWrapperX = null;
  let scrollbarWrapperY = null;
  let scrollbarX = null;
  let scrollbarY = null;
  let popover = null;

  // 配置参数
  const MODES = ["text", "iframe"];
  const optionPopoverId = "option-popover";
  const globalConfig = {};
  const programConfig = {
    scroll: {
      length: 20,
      width: 2,
      scale: 5,
    },
    transition: {
      duration: 200,
    },
  };
  const defaults = {
    system: {
      // MODES
      mode: "text",
      iframeUrl: "",
      isStarted: false,
    },
    wrapper: {
      width: 200,
      height: 100,
      right: 50,
      top: 50,
    },
  };
  const storageKey = "__script_use_iframe";
  // 已保存参数加载
  try {
    const oldConfig = JSON.parse(localStorage.getItem(storageKey));
    for (const key of Object.keys(defaults)) {
      defaults[key] = {
        ...defaults[key],
        ...oldConfig[key],
      };
    }
  } catch {}
  for (const key of Object.keys(defaults)) {
    defaults[key] = new Proxy(defaults[key], {
      set(...args) {
        saveConfigWhenIdle();
        return Reflect.set(...args);
      },
    });
  }

  /**
   * 工具函数
   */
  // 空闲执行函数
  const getIdleCaller = (func) => {
    let idleCbId = null;
    return (...args) => {
      if (idleCbId) {
        cancelIdleCallback(idleCbId);
        idleCbId = null;
      }
      idleCbId = requestIdleCallback(() => {
        func(...args);
      });
    };
  };

  // 参数持久化
  const saveConfigWhenIdle = getIdleCaller(() => {
    localStorage.setItem(storageKey, JSON.stringify(defaults));
  });

  // 元素可移动
  const makeElementMoveable = ({ triggerElm, moveElm, onMove, getDataWhenClick }) => {
    let originMousePosition = null;
    let originMoveElmRect = null;
    let extraData = {};
    const fnMove = (ev) => {
      const dx = ev.pageX - originMousePosition[0];
      const dy = ev.pageY - originMousePosition[1];

      onMove({
        moveElm,
        originMoveElmRect,
        deltaPosition: [dx, dy],
        extraData,
      });
    };
    const fnUp = (ev) => {
      contentIframe.classList.remove("__script_disabled");
      document.removeEventListener("mousemove", fnMove);
      document.removeEventListener("mouseup", fnUp);
    };
    triggerElm.onmousedown = (ev) => {
      if (ev.button !== 0) {
        return;
      }
      ev.preventDefault();
      originMousePosition = [ev.pageX, ev.pageY];
      originMoveElmRect = moveElm?.getBoundingClientRect() ?? null;
      extraData = getDataWhenClick?.();
      contentIframe.classList.add("__script_disabled");
      document.addEventListener("mousemove", fnMove);
      document.addEventListener("mouseup", fnUp);
    };
  };

  // 获取全局配置
  const getGlobalConfig = async (key) =>
    new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: "getGlobalData", payload: key }, (res) => {
        Object.assign(globalConfig, res);
        resolve(res);
      });
    });

  // 设置全局配置
  const setGlobalConfig = async () =>
    new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: "setGlobalData", payload: globalConfig }, () => {
        resolve();
      });
    });

  /**
   * 创建dom
   */
  // 创建 style
  const createStyle = () => {
    const style = document.createElement("style");
    style.innerText = `
        :root {
          --border-color: #e5e8ef;
          --font-color: #86909c;
          --font-size: 10px;
          --scroll-width: ${programConfig.scroll.width}px;
          --scroll-length: ${programConfig.scroll.length}px;
          --iframe-scale: ${globalConfig.iframeScale};
          --iframe-size: calc(100% / var(--iframe-scale));
          --opacity: ${globalConfig.opacity};
        }
        ::-webkit-scrollbar {
          display: none;
        }
        .__script_wrapper * {
          box-sizing: content-box;
        }
        .__script_wrapper {
          position: fixed;
          z-index: 999999;
        }
        .__script_page {
          position: relative;
          height: 100%;
        }
        .__script_content {
          box-sizing: border-box;
          padding: 0.5em;
          color: var(--font-color);
          overflow: auto;
          height: 100%;
          outline: 1px dashed transparent;
          font-size: 0;
          opacity: var(--opacity);
        }
        .__script_content-text {
          padding: 0.5em;
          width: fit-content;
          font-size: var(--font-size);
        }
        .__script_content-iframe-wrapper {
          width: 100%;
          height: 100%;
          overflow: hidden;
        }
        .__script_content-iframe {
          border: none;
          width: var(--iframe-size);
          height: var(--iframe-size);
          max-width: unset;
          max-height: unset;
          transform-origin: left top;
          transform: scale(var(--iframe-scale));
        }
        .__script_resize-icon {
          position: absolute;
          z-index: 1;
          left: -5px;
          bottom: -5px;
          width: 5px;
          height: 5px;
          padding: 5px;
          cursor: nesw-resize;
          background-color: var(--border-color);
          background-clip: content-box;
          clip-path: polygon(0 0, 0 100%, 100% 100%);
        }
        .__script_resize-icon:hover+.__script_content {
          outline-color: var(--border-color);
        }
        .__script_scrollbar-wrapper {
          position: absolute;
          right: 0;
          top: 0;
        }
        .__script_scrollbar {
          position: absolute;
          background-color: var(--border-color);
          transition: transform ${programConfig.transition.duration}ms;
        }
        .__script_scrollbar:hover {
          z-index: 1;
          transform: scale(${programConfig.scroll.scale});
        }
        .__script_scrollbar-x {
          top: 0;
          right: ${programConfig.scroll.width}px;
          width: var(--scroll-length);
          height: var(--scroll-width);
          transform-origin: right center;
        }
        .__script_scrollbar-y {
          top: ${programConfig.scroll.width}px;
          right: 0;
          width: var(--scroll-width);
          height: var(--scroll-length);
          transform-origin: center top;
        }
        .__script_slider {
          background-color: var(--font-color);
        }
        .__script_slider:hover {
          cursor: pointer;
        }
        .__script_slider-x {
          width: 0;
          height: var(--scroll-width);
        }
        .__script_slider-y {
          width: var(--scroll-width);
          height: 0;
        }
        .__script_toolbar {
          position: absolute;
          top: 0;
          right: -25px;
        }
        .__script_toolbar_btns {
          border: 1px dashed transparent;
          max-height: 20px;
          overflow: hidden;
          transition: max-height ${programConfig.transition.duration}ms;
        }
        .__script_toolbar_btns:hover {
          border-color: var(--border-color);
          max-height: 200px;
        }
        .__script_toolbar_btns>* {
          width: 20px;
          height: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--border-color);
          cursor: pointer;
          user-select: none;
          overflow: hidden;
        }
        .__script_toolbar_btns>*:hover {
          color: var(--font-color);
        }
        .__script_hidden {
          display: none;
        }
        .__script_disabled {
          pointer-events: none;
        }
        .__script_popover {
          margin: auto;
          padding: 0.5em;
          border: 2px dashed var(--border-color);
          font-size: 12px;
          box-shadow: 1px 1px 5px var(--border-color);
        }
        .__script_popover_row > * {
          padding: 0 0.5em;
        }
        .__script_popover_row:not(:last-child) {
          margin-bottom: 0.5em;
        }
        .__script_click {
          cursor: pointer;
          border: 1px dashed transparent;
        }
        .__script_click:hover {
          border-color: var(--border-color);
        }
        .__script_active {
          border-color: var(--border-color);
        }
        .__script_label {
          color: var(--font-color);
        }
        .__script_url {
          display: inline-block;
          max-width: 150px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          vertical-align: bottom;
        }
        `;
    return style;
  };
  // 创建容器
  const createWrapper = () => {
    const elm = document.createElement("div");
    elm.style.width = defaults.wrapper.width + "px";
    elm.style.height = defaults.wrapper.height + "px";
    elm.style.top = defaults.wrapper.top + "px";
    elm.style.right = defaults.wrapper.right + "px";

    elm.className = "__script_wrapper";

    elm.append(createPage(elm), createToolbar(elm), createPopover());
    // setTimeout(() => popover.showPopover());

    return elm;
  };

  // 创建 popover
  const createPopover = () => {
    popover = document.createElement("div");
    popover.setAttribute("popover", "");
    popover.className = "__script_popover";
    popover.id = optionPopoverId;

    // 模式切换
    const modeSetting = document.createElement("div");
    modeSetting.className = "__script_popover_row";
    modeSetting.dataset.key = "mode";
    modeSetting.innerHTML = `
      <label class="__script_label">mode: </label>${MODES.map(
        (m) =>
          `<span data-value="${m}" class="__script_click ${
            m === defaults.system.mode ? "__script_active" : ""
          }">${m}</span>`
      ).join("")}
    `;
    modeSetting.onclick = (ev) => {
      const { target } = ev;
      if (target.dataset.value && target.dataset.value !== defaults.system.mode) {
        switchContent(target.dataset.value);
        updatePopoverContent("mode");
      }
    };

    // url 管理
    const urlsSetting = document.createElement("div");
    urlsSetting.className = "__script_popover_row";
    urlsSetting.dataset.key = "url";
    urlsSetting.onclick = (ev) => {
      const { target } = ev;
      if (target.dataset.click) {
        const urlIndex = +target.parentElement.dataset.value;
        const url = globalConfig.iframeUrls[urlIndex];
        switch (target.dataset.click) {
          case "add":
            const newUrl = prompt("add url");
            newUrl && globalConfig.iframeUrls.push(newUrl);
            setGlobalConfig();
            break;
          case "edit":
            globalConfig.iframeUrls[urlIndex] = prompt("edit url", url) ?? url;
            setGlobalConfig();
            break;
          case "remove":
            globalConfig.iframeUrls.slice(urlIndex, 1);
            setGlobalConfig();
            break;
          case "use":
            defaults.system.iframeUrl = url;
            switchContent("iframe");
            updatePopoverContent("mode");
            break;
          default:
            break;
        }
        updatePopoverContent("url");
      }
    };
    setTimeout(() => updatePopoverContent("url"));

    // iframe 缩放管理
    const iframeScaleSetting = createInputRange({
      key: "scale",
      min: 0.1,
      max: 1,
      step: 0.05,
      defaultValue: globalConfig.iframeScale,
      callback: (v) => {
        globalConfig.iframeScale = v;
        setGlobalConfig();
        document.documentElement.style.setProperty("--iframe-scale", v);
      },
    });

    // opacity
    const opacitySetting = createInputRange({
      key: "opacity",
      min: 0,
      max: 1,
      step: 0.1,
      defaultValue: globalConfig.opacity,
      callback: (v) => {
        globalConfig.opacity = Math.max(Math.min(v, 1), 0);
        setGlobalConfig();
        document.documentElement.style.setProperty("--opacity", globalConfig.opacity);
      },
    });

    popover.append(modeSetting, iframeScaleSetting, opacitySetting, urlsSetting);

    return popover;
  };
  // 更新 popover
  const updatePopoverContent = async (type) => {
    if (type === "mode") {
      const modeItems = popover.querySelector("[data-key=mode]").querySelectorAll("[data-value]");
      modeItems.forEach((elm) => {
        elm.classList.remove("__script_active");
        if (elm.dataset.value === defaults.system.mode) {
          elm.classList.add("__script_active");
        }
      });
    } else if (type === "url") {
      await getGlobalConfig();
      const urlsWrapper = popover.querySelector("[data-key=url]");
      urlsWrapper.innerHTML = `
        <label class="__script_label">urls: </label>
        ${globalConfig.iframeUrls
          .map(
            (u, index) => `
              <div class="__script_popover_row" data-key="url" data-value="${index}">
                <span class="__script_click" data-click="use">✓</span>
                <span class="__script_click" data-click="edit">✎</span>
                <span class="__script_click" data-click="remove">✗</span>
                <span class="__script_url" title="${u}">${u}</span>
              </div>
            `
          )
          .join("")}
        <div class="__script_popover_row"><span class="__script_click" data-click="add">+</span></div>
      `;
    } else if (type === "scale") {
      const scaleInput = popover.querySelector("[data-key=scale]").querySelector("input");
      scaleInput.value = globalConfig.iframeScale;
    } else if (type === "opacity") {
      const opacityInput = popover.querySelector("[data-key=opacity]").querySelector("input");
      opacityInput.value = globalConfig.opacity;
    }
  };

  // 创建 range input
  const createInputRange = ({ key, min, max, step, defaultValue, callback }) => {
    const setting = document.createElement("div");
    setting.className = "__script_popover_row";
    setting.dataset.key = key;
    setting.innerHTML = `<label class="__script_label">${key}: </label>`;
    const settingInput = document.createElement("input");
    settingInput.style.width = "50px";
    settingInput.type = "number";
    settingInput.min = min;
    settingInput.max = max;
    settingInput.step = step;
    settingInput.value = defaultValue;
    setting.append(settingInput);
    settingInput.onkeydown = (ev) => {
      if (ev.code === "Enter") {
        callback(+ev.target.value);
      }
    };
    return setting;
  };

  // 创建工具栏
  const createToolbar = (wrapper) => {
    const toolbar = document.createElement("div");
    toolbar.className = "__script_toolbar";
    const btns = document.createElement("div");
    btns.className = "__script_toolbar_btns";

    // 移动按钮
    const moveBtn = document.createElement("div");
    moveBtn.innerText = "≡";
    moveBtn.style.cursor = "move";

    makeElementMoveable({
      triggerElm: moveBtn,
      moveElm: wrapper,
      getDataWhenClick: () => ({ clientWidth: document.documentElement.clientWidth }),
      onMove: ({ moveElm, originMoveElmRect, deltaPosition, extraData }) => {
        const dx = -deltaPosition[0] + (extraData.clientWidth - originMoveElmRect.right);
        const dy = deltaPosition[1] + originMoveElmRect.top;
        moveElm.style.right = dx + "px";
        moveElm.style.top = dy + "px";

        defaults.wrapper.right = dx;
        defaults.wrapper.top = dy;
      },
    });

    // 加载文件
    const loadFileBtn = document.createElement("div");
    loadFileBtn.innerText = "+";
    const input = document.createElement("input");
    input.className = "__script_hidden";
    input.type = "file";
    input.onchange = (ev) => {
      const file = ev.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = () => {
          contentText.innerText = reader.result;
          switchContent("text");
        };
        reader.readAsText(file);
      }
    };
    loadFileBtn.onclick = () => {
      input.click();
    };
    loadFileBtn.append(input);

    // 打开iframe
    const openIframeBtn = document.createElement("div");
    openIframeBtn.innerText = "∥";
    openIframeBtn.onclick = () => {
      const url = prompt("url", defaults.system.iframeUrl ?? "");
      defaults.system.iframeUrl = url ?? "";
      if (url !== null) {
        switchContent("iframe");
      }
    };

    // 切换显示模式
    const switchModeBtn = document.createElement("div");
    switchModeBtn.innerText = "≫";
    switchModeBtn.onclick = () => {
      let modeIndex = MODES.findIndex((m) => m === defaults.system.mode);
      if (modeIndex > -1) {
        modeIndex = (modeIndex + 1) % MODES.length;
      } else {
        modeIndex = 0;
      }
      switchContent(MODES[modeIndex]);
    };

    // 打开 popover
    const openPopoverBtn = document.createElement("div");
    openPopoverBtn.innerText = "✲";
    openPopoverBtn.onclick = () => {
      popover.showPopover();
    };

    btns.append(moveBtn, loadFileBtn, openIframeBtn, switchModeBtn, openPopoverBtn);
    toolbar.append(btns);

    return toolbar;
  };

  // 创建滚动条
  const createScrollbar = (type) => {
    const barWrapper = document.createElement("div");
    barWrapper.className = `__script_scrollbar __script_scrollbar-${type}`;

    const slider = document.createElement("div");
    slider.className = `__script_slider __script_slider-${type}`;

    makeElementMoveable({
      triggerElm: slider,
      getDataWhenClick: () => ({
        scrollLeft: content.scrollLeft,
        scrollTop: content.scrollTop,
        scrollWidth: content.scrollWidth,
        scrollHeight: content.scrollHeight,
      }),
      onMove: ({ deltaPosition, extraData }) => {
        if (type === "x") {
          const moveScale = extraData.scrollWidth / programConfig.scroll.length / programConfig.scroll.scale;
          content.scrollTo({ left: extraData.scrollLeft + deltaPosition[0] * moveScale });
        } else if (type === "y") {
          const moveScale = extraData.scrollHeight / programConfig.scroll.length / programConfig.scroll.scale;
          content.scrollTo({ top: extraData.scrollTop + deltaPosition[1] * moveScale });
        }
      },
    });

    barWrapper.append(slider);

    return {
      wrapper: barWrapper,
      slider,
    };
  };

  // 更新滚动条大小
  const updateScrollSize = () => {
    queueMicrotask(() => {
      const { offsetWidth, offsetHeight, scrollWidth, scrollHeight } = content;
      const ratioX = (offsetWidth / scrollWidth) * 100;
      const ratioY = (offsetHeight / scrollHeight) * 100;
      if (ratioX >= 100 || Number.isNaN(ratioX)) {
        scrollbarWrapperX.classList.add("__script_hidden");
      } else {
        scrollbarWrapperX.classList.remove("__script_hidden");
        scrollbarX.style.width = ratioX + "%";
      }
      if (ratioY >= 100 || Number.isNaN(ratioY)) {
        scrollbarWrapperY.classList.add("__script_hidden");
      } else {
        scrollbarWrapperY.classList.remove("__script_hidden");
        scrollbarY.style.height = ratioY + "%";
      }

      updateScrollSliderPosition();
    });
  };
  const updateScrollSizeWhenIdle = getIdleCaller(updateScrollSize);

  // 更新滚动条滑块位置
  const updateScrollSliderPosition = () => {
    queueMicrotask(() => {
      const { scrollWidth, scrollHeight, scrollTop, scrollLeft } = content;

      const offsetX = (scrollLeft / scrollWidth) * programConfig.scroll.length;
      scrollbarX.style.marginLeft = offsetX + "px";

      const offsetY = (scrollTop / scrollHeight) * programConfig.scroll.length;
      scrollbarY.style.marginTop = offsetY + "px";
    });
  };
  const updateScrollSliderPositionWhenIdle = getIdleCaller(updateScrollSliderPosition);

  // 创建 content 内容
  const switchContent = (mode) => {
    defaults.system.mode = mode;
    if (mode === "text") {
      contentText.classList.remove("__script_hidden");
      contentIframe.parentElement.classList.add("__script_hidden");
    } else if (mode === "iframe") {
      contentIframe.parentElement.classList.remove("__script_hidden");
      contentText.classList.add("__script_hidden");

      contentIframe.src = defaults.system.iframeUrl;
    }
    updateScrollSizeWhenIdle();
  };

  // 创建page页
  const createPage = (wrapper) => {
    const page = document.createElement("div");
    page.className = "__script_page";

    // page resize icon
    const moveIcon = document.createElement("div");
    moveIcon.className = "__script_resize-icon";

    makeElementMoveable({
      triggerElm: moveIcon,
      moveElm: wrapper,
      onMove: ({ moveElm, originMoveElmRect, deltaPosition }) => {
        const dw = -deltaPosition[0] + originMoveElmRect.width;
        const dh = deltaPosition[1] + originMoveElmRect.height;
        moveElm.style.width = dw + "px";
        moveElm.style.height = dh + "px";

        defaults.wrapper.width = dw;
        defaults.wrapper.height = dh;
        updateScrollSizeWhenIdle();
      },
    });

    // page content wrapper
    content = document.createElement("div");
    content.className = "__script_content";
    content.onscroll = (ev) => {
      updateScrollSliderPositionWhenIdle();
    };
    // text content
    contentText = document.createElement("div");
    contentText.className = "__script_content-text";
    contentText.innerText = "need some message ";
    // iframe content
    const contentIframeWrapper = document.createElement("div");
    contentIframeWrapper.className = "__script_content-iframe-wrapper";
    contentIframe = document.createElement("iframe");
    contentIframe.className = "__script_content-iframe";
    contentIframeWrapper.append(contentIframe);
    switchContent(defaults.system.mode);

    content.append(contentText, contentIframeWrapper);

    // create scrollbars
    const scrollbarWrapper = document.createElement("div");
    scrollbarWrapper.className = "__script_scrollbar-wrapper";
    const barX = createScrollbar("x");
    const barY = createScrollbar("y");
    scrollbarX = barX.slider;
    scrollbarY = barY.slider;
    scrollbarWrapperX = barX.wrapper;
    scrollbarWrapperY = barY.wrapper;
    scrollbarWrapper.append(barX.wrapper, barY.wrapper);
    setTimeout(() => updateScrollSizeWhenIdle());

    page.append(moveIcon, content, scrollbarWrapper);

    return page;
  };

  // 开启
  const start = async () => {
    if (!wrapper) {
      await getGlobalConfig();
      wrapper = createWrapper();
      document.body.append(wrapper);
      const style = createStyle();
      document.head.append(style);
    } else {
      wrapper.style.display = "";
    }
    defaults.system.isStarted = true;
  };
  // 关闭
  const stop = () => {
    if (!wrapper) return;
    wrapper.style.display = "none";
    defaults.system.isStarted = false;
  };
  // start / stop
  document.addEventListener("keydown", (ev) => {
    if (ev.code === "KeyI" && ev.ctrlKey) {
      // toggle open/close plugin
      if (defaults.system.isStarted) {
        stop();
      } else {
        start();
      }
    } else if (ev.code === "KeyP" && ev.ctrlKey) {
      // plus opacity
      const opa = Math.min(globalConfig.opacity + 0.1, 1);
      globalConfig.opacity = opa;
      setGlobalConfig();
      document.documentElement.style.setProperty("--opacity", globalConfig.opacity);
      updatePopoverContent("opacity");
    } else if (ev.code === "KeyO" && ev.ctrlKey) {
      // minus opacity
      const opa = Math.max(globalConfig.opacity - 0.1, 0);
      globalConfig.opacity = opa;
      setGlobalConfig();
      document.documentElement.style.setProperty("--opacity", globalConfig.opacity);
      updatePopoverContent("opacity");
    }
  });
  window.addEventListener("load", () => {
    if (defaults.system.isStarted) {
      start();
    }
  });
})();
