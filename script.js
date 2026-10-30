(function () {
  "use strict";

  var STORAGE_KEY = "pokemon-knockout-bracket-v1";

  /** Standard single-elim seeding pairs for first round (1-indexed seeds). */
  var SEED_ORDERS = {
    8: [1, 8, 4, 5, 2, 7, 3, 6],
    16: [1, 16, 8, 9, 4, 13, 5, 12, 2, 15, 7, 10, 3, 14, 6, 11],
    32: [
      1, 32, 16, 17, 8, 25, 9, 24, 4, 29, 13, 20, 5, 28, 12, 21, 2, 31, 15, 18, 7,
      26, 10, 23, 3, 30, 14, 19, 6, 27, 11, 22,
    ],
  };

  var ROUND_LABELS = {
    32: "32強",
    16: "16強",
    8: "8強",
    4: "準決賽",
    2: "決賽",
    1: "冠軍",
  };

  var state = {
    size: 16,
    players: [], // first-round slots: { id, seed, deck }
    winners: {}, // key: "r{round}-m{match}" -> player object or null
  };

  var el = {
    sizeSelect: null,
    entryGrid: null,
    bracket: null,
    status: null,
  };

  function emptyPlayer() {
    return { id: "", seed: "", deck: "" };
  }

  function clonePlayer(p) {
    if (!p) return null;
    return { id: p.id || "", seed: p.seed || "", deck: p.deck || "" };
  }

  function playerFilled(p) {
    return !!(p && String(p.id || "").trim());
  }

  function playerKey(p) {
    if (!playerFilled(p)) return "";
    return (
      String(p.id).trim() +
      "|" +
      String(p.seed || "").trim() +
      "|" +
      String(p.deck || "").trim()
    );
  }

  function playersEqual(a, b) {
    if (!a && !b) return true;
    if (!a || !b) return false;
    return playerKey(a) === playerKey(b);
  }

  function numRounds(size) {
    return Math.log2(size);
  }

  function matchCount(roundSize) {
    return roundSize / 2;
  }

  function winnerKey(roundSize, matchIndex) {
    return "r" + roundSize + "-m" + matchIndex;
  }

  function initPlayers(size) {
    var arr = [];
    for (var i = 0; i < size; i++) {
      arr.push(emptyPlayer());
    }
    return arr;
  }

  function roundSizes(size) {
    var rounds = [];
    for (var s = size; s >= 2; s = s / 2) {
      rounds.push(s);
    }
    return rounds;
  }

  function getSlotPlayer(roundSize, slotIndex) {
    // slotIndex is 0-based within the round (0 .. roundSize-1)
    if (roundSize === state.size) {
      return state.players[slotIndex] || emptyPlayer();
    }
    // Came from previous round winner of match floor(slotIndex)
    // Actually: for a round of size R, slot i comes from winner of match i in previous round of size R*2
    // Wait: previous round had R*2 players, R matches. Match m produces the player for slot m in current round.
    var prevSize = roundSize * 2;
    var matchIdx = slotIndex;
    return state.winners[winnerKey(prevSize, matchIdx)] || null;
  }

  function getMatchPlayers(roundSize, matchIndex) {
    var top = getSlotPlayer(roundSize, matchIndex * 2);
    var bottom = getSlotPlayer(roundSize, matchIndex * 2 + 1);
    return [top, bottom];
  }

  /** Clear winner of this match and all downstream dependents. */
  function clearWinnerAndDownstream(roundSize, matchIndex) {
    var key = winnerKey(roundSize, matchIndex);
    delete state.winners[key];

    // This match's winner feeds into next round slot = matchIndex
    // Next round size = roundSize / 2
    // Next match index = floor(matchIndex / 2)
    if (roundSize > 2) {
      var nextRound = roundSize / 2;
      var nextMatch = Math.floor(matchIndex / 2);
      clearWinnerAndDownstream(nextRound, nextMatch);
    } else if (roundSize === 2) {
      // Final feeds champion
      delete state.winners["champion"];
    }
  }

  function setWinner(roundSize, matchIndex, player) {
    var key = winnerKey(roundSize, matchIndex);
    var existing = state.winners[key];

    if (playersEqual(existing, player)) {
      // Same pick — treat as toggle clear
      clearWinnerAndDownstream(roundSize, matchIndex);
      return;
    }

    // Changing winner: clear downstream first, then set
    clearWinnerAndDownstream(roundSize, matchIndex);
    state.winners[key] = clonePlayer(player);

    if (roundSize === 2) {
      state.winners["champion"] = clonePlayer(player);
    }
  }

  function clearMatch(roundSize, matchIndex) {
    clearWinnerAndDownstream(roundSize, matchIndex);
  }

  function autoSeed() {
    var order = SEED_ORDERS[state.size];
    if (!order) return;
    for (var i = 0; i < state.size; i++) {
      if (!state.players[i]) state.players[i] = emptyPlayer();
      state.players[i].seed = String(order[i]);
    }
    // Changing seeds / first round invalidates all winners
    state.winners = {};
    renderEntries();
    persist();
    if (document.getElementById("bracket").children.length) {
      renderBracket();
    }
  }

  function readEntriesFromDom() {
    var cards = el.entryGrid.querySelectorAll(".entry-card");
    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      var idx = parseInt(card.getAttribute("data-index"), 10);
      state.players[idx] = {
        id: (card.querySelector('[data-field="id"]') || {}).value || "",
        seed: (card.querySelector('[data-field="seed"]') || {}).value || "",
        deck: (card.querySelector('[data-field="deck"]') || {}).value || "",
      };
    }
  }

  function onEntryChange() {
    var prev = state.players.map(playerKey);
    readEntriesFromDom();
    var changed = false;
    for (var i = 0; i < state.size; i++) {
      if (prev[i] !== playerKey(state.players[i])) {
        changed = true;
        break;
      }
    }
    if (changed) {
      // First-round change: clear all advancement
      state.winners = {};
      persist();
      if (el.bracket.children.length) {
        renderBracket();
      }
    } else {
      persist();
    }
  }

  function renderEntries() {
    el.entryGrid.innerHTML = "";
    for (var i = 0; i < state.size; i++) {
      var p = state.players[i] || emptyPlayer();
      var card = document.createElement("div");
      card.className = "entry-card";
      card.setAttribute("data-index", String(i));

      var badge = document.createElement("span");
      badge.className = "seed-badge";
      badge.textContent = "位置 " + (i + 1);
      card.appendChild(badge);

      var title = document.createElement("div");
      title.className = "slot-title";
      title.textContent = "對戰位置 " + (i + 1);
      card.appendChild(title);

      card.appendChild(fieldLabelInput("選手ID", "id", p.id, "例如：AshKetchum"));
      card.appendChild(fieldLabelInput("編號（種子）", "seed", p.seed, "1"));
      card.appendChild(fieldLabelInput("使用牌組", "deck", p.deck, "例如：皮卡丘主題"));

      el.entryGrid.appendChild(card);
    }

    el.entryGrid.querySelectorAll("input").forEach(function (input) {
      input.addEventListener("input", onEntryChange);
      input.addEventListener("change", onEntryChange);
    });
  }

  function fieldLabelInput(labelText, field, value, placeholder) {
    var wrap = document.createElement("div");
    var label = document.createElement("label");
    label.textContent = labelText;
    var input = document.createElement("input");
    input.type = "text";
    input.setAttribute("data-field", field);
    input.value = value || "";
    input.placeholder = placeholder || "";
    input.autocomplete = "off";
    wrap.appendChild(label);
    wrap.appendChild(input);
    return wrap;
  }

  function renderPlayerRow(player, roundSize, matchIndex, slotInMatch) {
    var row = document.createElement("div");
    row.className = "player-row";

    var winner = state.winners[winnerKey(roundSize, matchIndex)];
    var isWinner = playerFilled(player) && playersEqual(winner, player);
    if (isWinner) row.classList.add("is-winner");

    if (!playerFilled(player)) {
      row.classList.add("is-empty");
      var ph = document.createElement("span");
      ph.className = "placeholder-text";
      ph.style.flex = "1";
      ph.textContent = roundSize === state.size ? "（尚未填寫）" : "勝者晉級";
      row.appendChild(ph);
      return row;
    }

    var seed = document.createElement("span");
    seed.className = "seed-num";
    seed.textContent = player.seed ? "#" + player.seed : "·";
    row.appendChild(seed);

    var info = document.createElement("div");
    info.className = "player-info";
    var idEl = document.createElement("div");
    idEl.className = "player-id";
    idEl.textContent = player.id;
    idEl.title = player.id;
    info.appendChild(idEl);
    if (player.deck) {
      var deckEl = document.createElement("div");
      deckEl.className = "player-deck";
      deckEl.textContent = player.deck;
      deckEl.title = player.deck;
      info.appendChild(deckEl);
    }
    row.appendChild(info);

    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn btn-sm btn-advance no-print";
    btn.textContent = isWinner ? "已晉級" : "晉級";
    btn.title = isWinner
      ? "再次點擊可取消晉級並清除後續結果"
      : "將此選手晉級到下一輪";
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      setWinner(roundSize, matchIndex, player);
      persist();
      renderBracket();
    });
    row.appendChild(btn);

    return row;
  }

  function renderBracket() {
    el.bracket.innerHTML = "";
    var rounds = roundSizes(state.size);

    for (var r = 0; r < rounds.length; r++) {
      var rs = rounds[r];
      var roundEl = document.createElement("div");
      roundEl.className = "round";

      var title = document.createElement("div");
      title.className = "round-title";
      title.textContent = ROUND_LABELS[rs] || rs + "強";
      roundEl.appendChild(title);

      var matches = matchCount(rs);
      // Group matches in pairs for connector visuals (except final)
      var groupEl = null;

      for (var m = 0; m < matches; m++) {
        if (rs > 2) {
          if (m % 2 === 0) {
            groupEl = document.createElement("div");
            groupEl.className = "match-group";
            if (m + 1 < matches) groupEl.classList.add("has-connector");
            roundEl.appendChild(groupEl);
          }
        } else {
          groupEl = document.createElement("div");
          groupEl.className = "match-group";
          roundEl.appendChild(groupEl);
        }

        var matchEl = document.createElement("div");
        matchEl.className = "match";

        var pair = document.createElement("div");
        pair.className = "match-pair";

        var players = getMatchPlayers(rs, m);
        pair.appendChild(renderPlayerRow(players[0], rs, m, 0));
        pair.appendChild(renderPlayerRow(players[1], rs, m, 1));

        matchEl.appendChild(pair);

        var clearBtn = document.createElement("button");
        clearBtn.type = "button";
        clearBtn.className = "btn btn-sm btn-clear-match no-print";
        clearBtn.textContent = "清除";
        clearBtn.title = "清除此場晉級結果與後續依賴";
        (function (roundSize, matchIndex) {
          clearBtn.addEventListener("click", function () {
            clearMatch(roundSize, matchIndex);
            persist();
            renderBracket();
          });
        })(rs, m);
        matchEl.appendChild(clearBtn);

        groupEl.appendChild(matchEl);
      }

      el.bracket.appendChild(roundEl);
    }

    // Champion column
    var champRound = document.createElement("div");
    champRound.className = "round champion-round";
    var champTitle = document.createElement("div");
    champTitle.className = "round-title";
    champTitle.textContent = "冠軍";
    champRound.appendChild(champTitle);

    var champGroup = document.createElement("div");
    champGroup.className = "match-group";
    var champMatch = document.createElement("div");
    champMatch.className = "match";

    var champ = state.winners["champion"];
    // Also derive from final if set
    if (!champ && state.winners[winnerKey(2, 0)]) {
      champ = state.winners[winnerKey(2, 0)];
      state.winners["champion"] = clonePlayer(champ);
    }

    var card = document.createElement("div");
    card.className = "champion-card";
    var label = document.createElement("div");
    label.className = "champion-label";
    label.textContent = "CHAMPION";
    card.appendChild(label);

    if (playerFilled(champ)) {
      var name = document.createElement("div");
      name.className = "champion-name";
      name.textContent = champ.id;
      card.appendChild(name);
      var meta = document.createElement("div");
      meta.className = "champion-meta";
      var parts = [];
      if (champ.seed) parts.push("#" + champ.seed);
      if (champ.deck) parts.push(champ.deck);
      meta.textContent = parts.join(" · ") || "勝者晉級";
      card.appendChild(meta);
    } else {
      var empty = document.createElement("div");
      empty.className = "champion-empty";
      empty.textContent = "勝者晉級";
      card.appendChild(empty);
    }

    champMatch.appendChild(card);
    champGroup.appendChild(champMatch);
    champRound.appendChild(champGroup);
    el.bracket.appendChild(champRound);

    el.status.textContent = "已產生 · " + state.size + "強";
    el.status.classList.add("ready");
  }

  function generate() {
    readEntriesFromDom();
    // Keep winners that still make sense? Safer: keep winners only if first-round players unchanged keys
    // On generate we keep existing winners (user may re-generate after edits which already cleared)
    renderBracket();
    persist();
    document.getElementById("bracketSection").scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  function resetAll() {
    if (
      !window.confirm(
        "確定要重置嗎？將清除所有選手資料與晉級結果。"
      )
    ) {
      return;
    }
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
    var oldPlayers = state.players.slice();
    state.size = newSize;
    state.players = initPlayers(newSize);
    for (var i = 0; i < Math.min(oldPlayers.length, newSize); i++) {
      state.players[i] = oldPlayers[i] || emptyPlayer();
    }
    state.winners = {};
    renderEntries();
    el.bracket.innerHTML = "";
    el.status.textContent = "尚未產生";
    el.status.classList.remove("ready");
    persist();
  }

  function persist() {
    try {
      var data = {
        size: state.size,
        players: state.players,
        winners: state.winners,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      // ignore quota / private mode
    }
  }

  function restore() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      var data = JSON.parse(raw);
      if (!data || !data.size) return false;
      state.size = data.size === 8 || data.size === 16 || data.size === 32 ? data.size : 16;
      state.players = Array.isArray(data.players)
        ? data.players
        : initPlayers(state.size);
      while (state.players.length < state.size) state.players.push(emptyPlayer());
      state.players = state.players.slice(0, state.size);
      state.winners = data.winners && typeof data.winners === "object" ? data.winners : {};
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

    document.getElementById("btnAutoSeed").addEventListener("click", function () {
      readEntriesFromDom();
      autoSeed();
    });
    document.getElementById("btnGenerate").addEventListener("click", generate);
    document.getElementById("btnReset").addEventListener("click", resetAll);
    document.getElementById("btnPrint").addEventListener("click", function () {
      window.print();
    });
    el.sizeSelect.addEventListener("change", onSizeChange);
  }

  function init() {
    bind();
    var restored = restore();
    el.sizeSelect.value = String(state.size);
    if (!restored) {
      state.players = initPlayers(state.size);
      state.winners = {};
    }
    renderEntries();
    // If we have any filled player or winners, show bracket
    var any = state.players.some(playerFilled) || Object.keys(state.winners).length > 0;
    if (any) {
      renderBracket();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
