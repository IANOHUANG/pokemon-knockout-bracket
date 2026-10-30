(function () {
  "use strict";

  var STORAGE_KEY = "iano-ptcg-bracket-v2";

  /** First-round seed order top→bottom for each half (standard bracket, #1 left / #2 right). */
  var LEFT_SEEDS = {
    8: [1, 8, 4, 5],
    16: [1, 16, 8, 9, 4, 13, 5, 12],
    32: [1, 32, 16, 17, 8, 25, 9, 24, 4, 29, 13, 20, 5, 28, 12, 21],
  };
  var RIGHT_SEEDS = {
    8: [2, 7, 3, 6],
    16: [2, 15, 7, 10, 3, 14, 6, 11],
    32: [2, 31, 15, 18, 7, 26, 10, 23, 3, 30, 14, 19, 6, 27, 11, 22],
  };

  var ROUND_LABELS = {
    32: "32強",
    16: "16強",
    8: "8強",
    4: "準決賽",
    2: "決賽",
  };

  var state = {
    size: 16,
    players: [], // index = seed-1; { name, playerId, deck }
    winners: {}, // keys: "L-r{n}-m{i}", "R-r{n}-m{i}", "final", "champion"
  };

  var el = {};

  function emptyPlayer() {
    return { name: "", playerId: "", deck: "" };
  }

  function clonePlayer(p) {
    if (!p) return null;
    return {
      name: p.name || "",
      playerId: p.playerId || "",
      deck: p.deck || "",
      seed: p.seed || null,
    };
  }

  function playerFilled(p) {
    return !!(p && String(p.name || "").trim());
  }

  function playerKey(p) {
    if (!p) return "";
    return (
      String(p.seed || "") +
      "|" +
      String(p.name || "").trim() +
      "|" +
      String(p.playerId || "").trim() +
      "|" +
      String(p.deck || "").trim()
    );
  }

  function playersEqual(a, b) {
    if (!a && !b) return true;
    if (!a || !b) return false;
    return playerKey(a) === playerKey(b);
  }

  function initPlayers(size) {
    var arr = [];
    for (var i = 0; i < size; i++) {
      arr.push(emptyPlayer());
    }
    return arr;
  }

  function getBySeed(seed) {
    var p = state.players[seed - 1];
    if (!p) return null;
    var out = clonePlayer(p);
    if (out) out.seed = seed;
    return out;
  }

  function sideSeeds(side) {
    return side === "L" ? LEFT_SEEDS[state.size] : RIGHT_SEEDS[state.size];
  }

  function halfSize() {
    return state.size / 2;
  }

  /** Round sizes on one side from first round down to 2 (side final = 2 players). */
  function sideRoundSizes() {
    var sizes = [];
    for (var s = halfSize(); s >= 2; s = s / 2) {
      sizes.push(s);
    }
    return sizes;
  }

  function wKey(side, roundSize, matchIndex) {
    return side + "-r" + roundSize + "-m" + matchIndex;
  }

  function getSideSlot(side, roundSize, slotIndex) {
    if (roundSize === halfSize()) {
      var seeds = sideSeeds(side);
      return getBySeed(seeds[slotIndex]);
    }
    var prev = roundSize * 2;
    var fromMatch = slotIndex;
    return state.winners[wKey(side, prev, fromMatch)] || null;
  }

  function getSideMatchPlayers(side, roundSize, matchIndex) {
    return [
      getSideSlot(side, roundSize, matchIndex * 2),
      getSideSlot(side, roundSize, matchIndex * 2 + 1),
    ];
  }

  function clearSideDownstream(side, roundSize, matchIndex) {
    delete state.winners[wKey(side, roundSize, matchIndex)];
    if (roundSize > 2) {
      clearSideDownstream(side, roundSize / 2, Math.floor(matchIndex / 2));
    } else {
      // side final feeds overall final
      delete state.winners["final"];
      delete state.winners["champion"];
    }
  }

  function setSideWinner(side, roundSize, matchIndex, player) {
    var key = wKey(side, roundSize, matchIndex);
    var existing = state.winners[key];
    if (playersEqual(existing, player)) {
      clearSideDownstream(side, roundSize, matchIndex);
      return;
    }
    clearSideDownstream(side, roundSize, matchIndex);
    state.winners[key] = clonePlayer(player);
  }

  function clearFinalDownstream() {
    delete state.winners["final"];
    delete state.winners["champion"];
  }

  function setFinalWinner(player) {
    var existing = state.winners["final"];
    if (playersEqual(existing, player)) {
      clearFinalDownstream();
      return;
    }
    clearFinalDownstream();
    state.winners["final"] = clonePlayer(player);
    state.winners["champion"] = clonePlayer(player);
  }

  function leftFinalist() {
    return state.winners[wKey("L", 2, 0)] || null;
  }

  function rightFinalist() {
    return state.winners[wKey("R", 2, 0)] || null;
  }

  /* ---------- Entry panel ---------- */

  function readEntriesFromDom() {
    var cards = el.entryGrid.querySelectorAll(".entry-card");
    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      var idx = parseInt(card.getAttribute("data-seed"), 10) - 1;
      state.players[idx] = {
        name: (card.querySelector('[data-field="name"]') || {}).value || "",
        playerId: (card.querySelector('[data-field="playerId"]') || {}).value || "",
        deck: (card.querySelector('[data-field="deck"]') || {}).value || "",
      };
    }
  }

  function onEntryChange() {
    var prev = state.players.map(function (p, i) {
      var c = clonePlayer(p);
      if (c) c.seed = i + 1;
      return playerKey(c);
    });
    readEntriesFromDom();
    var changed = false;
    for (var i = 0; i < state.size; i++) {
      var c = clonePlayer(state.players[i]);
      if (c) c.seed = i + 1;
      if (prev[i] !== playerKey(c)) {
        changed = true;
        break;
      }
    }
    if (changed) {
      state.winners = {};
      persist();
      if (el.bracket.children.length) renderBracket();
    } else {
      persist();
    }
  }

  function field(labelText, fieldName, value, placeholder) {
    var lab = document.createElement("label");
    lab.textContent = labelText;
    var input = document.createElement("input");
    input.type = "text";
    input.setAttribute("data-field", fieldName);
    input.value = value || "";
    input.placeholder = placeholder || "";
    input.autocomplete = "off";
    lab.appendChild(input);
    return lab;
  }

  function renderEntries() {
    el.entryGrid.innerHTML = "";
    for (var seed = 1; seed <= state.size; seed++) {
      var p = state.players[seed - 1] || emptyPlayer();
      var card = document.createElement("div");
      card.className = "entry-card";
      card.setAttribute("data-seed", String(seed));

      var badge = document.createElement("div");
      badge.className = "entry-seed";
      badge.textContent = "#" + seed;
      badge.title = "種子 " + seed;
      card.appendChild(badge);

      var fields = document.createElement("div");
      fields.className = "entry-fields";
      fields.appendChild(field("選手名稱", "name", p.name, "顯示名稱"));
      fields.appendChild(field("玩家ID", "playerId", p.playerId, "玩家／帳號 ID"));
      fields.appendChild(field("使用牌組", "deck", p.deck, "牌組名稱"));
      card.appendChild(fields);

      el.entryGrid.appendChild(card);
    }
    el.entryGrid.querySelectorAll("input").forEach(function (input) {
      input.addEventListener("input", onEntryChange);
      input.addEventListener("change", onEntryChange);
    });
  }

  /* ---------- Bracket render ---------- */

  function renderPlayerRow(player, onAdvance, isWinner) {
    var row = document.createElement("div");
    row.className = "player-row";
    if (isWinner) row.classList.add("is-winner");

    if (!playerFilled(player)) {
      row.classList.add("is-empty");
      var ph = document.createElement("span");
      ph.className = "placeholder-text";
      ph.textContent = "勝者晉級";
      row.appendChild(ph);
      return row;
    }

    var seed = document.createElement("span");
    seed.className = "seed-num";
    seed.textContent = player.seed ? "#" + player.seed : "·";
    row.appendChild(seed);

    var info = document.createElement("div");
    info.className = "player-info";
    var nameEl = document.createElement("div");
    nameEl.className = "player-name";
    nameEl.textContent = player.name;
    nameEl.title = player.name;
    info.appendChild(nameEl);
    var metaParts = [];
    if (player.playerId) metaParts.push(player.playerId);
    if (player.deck) metaParts.push(player.deck);
    if (metaParts.length) {
      var meta = document.createElement("div");
      meta.className = "player-meta";
      meta.textContent = metaParts.join(" · ");
      meta.title = metaParts.join(" · ");
      info.appendChild(meta);
    }
    row.appendChild(info);

    if (onAdvance) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn btn-sm btn-advance no-print";
      btn.textContent = isWinner ? "已晉級" : "晉級";
      btn.title = isWinner
        ? "再次點擊可取消晉級並清除後續結果"
        : "將此選手晉級到下一輪";
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        onAdvance(player);
      });
      row.appendChild(btn);
    }
    return row;
  }

  function renderMatch(players, winner, onPick, onClear) {
    var matchEl = document.createElement("div");
    matchEl.className = "match";

    var pair = document.createElement("div");
    pair.className = "match-pair";
    pair.appendChild(
      renderPlayerRow(players[0], onPick, playersEqual(winner, players[0]))
    );
    pair.appendChild(
      renderPlayerRow(players[1], onPick, playersEqual(winner, players[1]))
    );
    matchEl.appendChild(pair);

    var clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.className = "btn btn-sm btn-clear-match no-print";
    clearBtn.textContent = "清除";
    clearBtn.title = "清除此場晉級結果與後續依賴";
    clearBtn.addEventListener("click", onClear);
    matchEl.appendChild(clearBtn);

    return matchEl;
  }

  function renderSide(side) {
    var sideEl = document.createElement("div");
    sideEl.className = "bracket-side " + (side === "L" ? "left" : "right");

    var rounds = sideRoundSizes();
    // Left: first round on far left → side final near center
    // Right: first round on far right → side final near center → reverse order in DOM
    var order = side === "L" ? rounds.slice() : rounds.slice().reverse();

    for (var ri = 0; ri < order.length; ri++) {
      var rs = order[ri];
      var roundEl = document.createElement("div");
      roundEl.className = "round";
      if (rs === 2) roundEl.classList.add("is-side-final");

      var title = document.createElement("div");
      title.className = "round-title";
      // Side round with `rs` players corresponds to tournament round of `rs*2`
      title.textContent = ROUND_LABELS[rs * 2] || rs * 2 + "強";
      roundEl.appendChild(title);

      var matches = rs / 2;
      var stack = document.createElement("div");
      stack.className = "match-stack";

      // Group consecutive matches in pairs for vertical connectors (when >1 match)
      var group = null;
      for (var m = 0; m < matches; m++) {
        if (matches > 1) {
          if (m % 2 === 0) {
            group = document.createElement("div");
            group.className = "match-pair-group";
            stack.appendChild(group);
          }
        } else {
          group = document.createElement("div");
          group.className = "match-pair-group";
          stack.appendChild(group);
        }

        (function (roundSize, matchIndex) {
          var players = getSideMatchPlayers(side, roundSize, matchIndex);
          var winner = state.winners[wKey(side, roundSize, matchIndex)] || null;
          var matchEl = renderMatch(
            players,
            winner,
            function (player) {
              setSideWinner(side, roundSize, matchIndex, player);
              persist();
              renderBracket();
            },
            function () {
              clearSideDownstream(side, roundSize, matchIndex);
              persist();
              renderBracket();
            }
          );
          group.appendChild(matchEl);
        })(rs, m);
      }

      roundEl.appendChild(stack);
      sideEl.appendChild(roundEl);
    }

    return sideEl;
  }

  function renderCenter() {
    var center = document.createElement("div");
    center.className = "bracket-center";

    // Final
    var finalBlock = document.createElement("div");
    finalBlock.className = "final-block";
    var flabel = document.createElement("div");
    flabel.className = "center-label";
    flabel.textContent = "決賽";
    finalBlock.appendChild(flabel);

    var finalists = [leftFinalist(), rightFinalist()];
    var finalWinner = state.winners["final"] || null;
    finalBlock.appendChild(
      renderMatch(
        finalists,
        finalWinner,
        function (player) {
          setFinalWinner(player);
          persist();
          renderBracket();
        },
        function () {
          clearFinalDownstream();
          persist();
          renderBracket();
        }
      )
    );
    center.appendChild(finalBlock);

    // Champion
    var champBlock = document.createElement("div");
    champBlock.className = "champion-block";
    var card = document.createElement("div");
    card.className = "champion-card";
    var label = document.createElement("div");
    label.className = "champion-label";
    label.textContent = "冠軍 CHAMPION";
    card.appendChild(label);

    var champ = state.winners["champion"] || state.winners["final"] || null;
    if (playerFilled(champ)) {
      var name = document.createElement("div");
      name.className = "champion-name";
      name.textContent = champ.name;
      card.appendChild(name);
      var meta = document.createElement("div");
      meta.className = "champion-meta";
      var parts = [];
      if (champ.seed) parts.push("#" + champ.seed);
      if (champ.playerId) parts.push(champ.playerId);
      if (champ.deck) parts.push(champ.deck);
      meta.textContent = parts.join(" · ") || "";
      card.appendChild(meta);
    } else {
      var empty = document.createElement("div");
      empty.className = "champion-empty";
      empty.textContent = "勝者晉級";
      card.appendChild(empty);
    }
    champBlock.appendChild(card);
    center.appendChild(champBlock);

    return center;
  }

  function updateSizeClass() {
    document.body.classList.remove("size-8", "size-16", "size-32");
    document.body.classList.add("size-" + state.size);
  }

  function mmToPx(mm) {
    var probe = document.createElement("div");
    probe.style.cssText = "position:absolute;left:-9999px;width:100mm;height:100mm;";
    document.body.appendChild(probe);
    var px = probe.offsetWidth / 100;
    document.body.removeChild(probe);
    return mm * px;
  }

  /** Fill printable area on both axes with CSS zoom (single A4 landscape page). */
  function fitPrintScale() {
    var wrap = el.printWrap || el.bracket;
    wrap.style.setProperty("--print-scale", "1");
    wrap.style.width = "";
    wrap.style.height = "";
    wrap.style.overflow = "";
    el.bracket.style.minHeight = "";
    el.bracket.style.height = "";
    document.documentElement.style.removeProperty("--print-target-h");

    document.documentElement.classList.add("print-measure");
    updateSizeClass();

    var availW = mmToPx(279);
    var headerEl = document.querySelector(".app-header");
    var headerH = headerEl ? headerEl.getBoundingClientRect().height : mmToPx(11);
    var availH = Math.max(mmToPx(192) - headerH, mmToPx(160));

    void el.bracket.offsetHeight;
    var bw = el.bracket.scrollWidth;
    var bh = Math.max(el.bracket.scrollHeight, 1);
    if (!bw) {
      document.documentElement.classList.remove("print-measure");
      wrap.style.setProperty("--print-scale", "0.9");
      return 0.9;
    }

    // Match page aspect: stretch height so bw/bh ≈ availW/availH when content is too short
    var targetH = (bw * availH) / availW;
    if (targetH > bh) {
      el.bracket.style.minHeight = targetH + "px";
      el.bracket.style.height = targetH + "px";
      document.documentElement.style.setProperty("--print-target-h", targetH + "px");
      void el.bracket.offsetHeight;
      bw = el.bracket.scrollWidth;
      bh = Math.max(el.bracket.scrollHeight, 1);
    }

    var scale = Math.min(availW / bw, availH / bh) * 0.96;
    scale = Math.max(0.3, Math.min(scale, 1.5));

    // Final stretch so zoomed size fills avail box
    var layoutH = availH / scale;
    el.bracket.style.minHeight = layoutH + "px";
    el.bracket.style.height = layoutH + "px";
    document.documentElement.style.setProperty("--print-target-h", layoutH + "px");

    document.documentElement.classList.remove("print-measure");
    wrap.style.setProperty("--print-scale", String(scale.toFixed(4)));
    return scale;
  }

  function preparePrint() {
    updateSizeClass();
    // Ensure bracket exists
    if (!el.bracket.children.length) {
      renderBracket();
    }
    fitPrintScale();
  }

  function renderBracket() {
    el.bracket.innerHTML = "";
    el.bracket.appendChild(renderSide("L"));
    el.bracket.appendChild(renderCenter());
    el.bracket.appendChild(renderSide("R"));
    updateSizeClass();
    fitPrintScale();
    el.status.textContent = "已產生 · " + state.size + "強（左右對開）";
    el.status.classList.add("ready");
  }

  function generate() {
    readEntriesFromDom();
    renderBracket();
    persist();
    document.getElementById("bracketSection").scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  function resetAll() {
    if (!window.confirm("確定要重置嗎？將清除所有選手資料與晉級結果。")) return;
    state.players = initPlayers(state.size);
    state.winners = {};
    renderEntries();
    el.bracket.innerHTML = "";
    el.status.textContent = "尚未產生";
    el.status.classList.remove("ready");
    persist();
  }

  function onSizeChange() {
    readEntriesFromDom();
    var newSize = parseInt(el.sizeSelect.value, 10);
    if (newSize === state.size) return;
    var old = state.players.slice();
    state.size = newSize;
    state.players = initPlayers(newSize);
    for (var i = 0; i < Math.min(old.length, newSize); i++) {
      state.players[i] = old[i] || emptyPlayer();
    }
    state.winners = {};
    updateSizeClass();
    renderEntries();
    el.bracket.innerHTML = "";
    el.status.textContent = "尚未產生";
    el.status.classList.remove("ready");
    persist();
  }

  function persist() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          size: state.size,
          players: state.players,
          winners: state.winners,
        })
      );
    } catch (e) {}
  }

  function restore() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      var data = JSON.parse(raw);
      if (!data || !data.size) return false;
      if (data.size !== 8 && data.size !== 16 && data.size !== 32) return false;
      // Ignore legacy shapes without name field
      if (Array.isArray(data.players) && data.players.length) {
        var sample = data.players[0];
        if (sample && sample.id !== undefined && sample.name === undefined) {
          return false;
        }
      }
      state.size = data.size;
      state.players = Array.isArray(data.players)
        ? data.players
        : initPlayers(state.size);
      while (state.players.length < state.size) state.players.push(emptyPlayer());
      state.players = state.players.slice(0, state.size).map(function (p) {
        return {
          name: (p && p.name) || "",
          playerId: (p && p.playerId) || "",
          deck: (p && p.deck) || "",
        };
      });
      state.winners =
        data.winners && typeof data.winners === "object" ? data.winners : {};
      return true;
    } catch (e) {
      return false;
    }
  }

  function bind() {
    el.sizeSelect = document.getElementById("sizeSelect");
    el.entryGrid = document.getElementById("entryGrid");
    el.bracket = document.getElementById("bracket");
    el.status = document.getElementById("bracketStatus");

    document.getElementById("btnGenerate").addEventListener("click", generate);
    document.getElementById("btnReset").addEventListener("click", resetAll);
    document.getElementById("btnPrint").addEventListener("click", function () {
      preparePrint();
      setTimeout(function () { window.print(); }, 50);
    });
    el.sizeSelect.addEventListener("change", onSizeChange);

    el.printWrap = document.getElementById("printScaleWrap") || el.bracket;
    window.addEventListener("beforeprint", preparePrint);
    // Some browsers fire matchMedia instead of/in addition to beforeprint
    if (window.matchMedia) {
      var mq = window.matchMedia("print");
      var onMq = function (e) {
        if (e.matches) preparePrint();
      };
      if (mq.addEventListener) mq.addEventListener("change", onMq);
      else if (mq.addListener) mq.addListener(onMq);
    }
  }

  function init() {
    bind();
    var restored = restore();
    el.sizeSelect.value = String(state.size);
    updateSizeClass();
    if (!restored) {
      state.players = initPlayers(state.size);
      state.winners = {};
    }
    renderEntries();
    var any =
      state.players.some(playerFilled) || Object.keys(state.winners).length > 0;
    if (any) renderBracket();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
