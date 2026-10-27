/* Game-reported private round history. No automatic submissions or embedded author tokens. */
(function (root) {
  class GameHubMatches {
    static connect(options) { return new GameHubMatches(options); }

    constructor(options = {}) {
      const path = /^\/g\/([A-Za-z0-9_-]+)\/v\/([A-Za-z0-9_-]+)\//.exec(root.location.pathname);
      this.gameId = options.gameId || (path && path[1]) || root.GAMEHUB_GAME_ID;
      this.versionId = options.versionId || (path && path[2]) || null;
      this.token = options.token || "";
      if (!this.gameId) throw new Error("请通过 gameId 指定游戏");
      this.base = "/api/v1/games/" + encodeURIComponent(this.gameId) + "/matches";
    }

    async request(url, payload) {
      const headers = {};
      if (this.token) headers.Authorization = "Bearer " + this.token;
      if (payload !== undefined) headers["Content-Type"] = "application/json";
      const response = await fetch(url, {
        method: payload === undefined ? "GET" : "POST", credentials: "same-origin",
        cache: "no-store", headers,
        body: payload === undefined ? undefined : JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) {
        const error = new Error(data.error || "对局记录请求失败");
        error.status = response.status;
        throw error;
      }
      return data;
    }

    submit(payload) { return this.request(this.base, payload); }

    history({ limit = 20, before } = {}) {
      const query = new URLSearchParams({ limit: String(limit) });
      if (before != null) query.set("before", String(before));
      return this.request(this.base + "/me?" + query);
    }

    start() {
      // getRandomValues also works on the existing HTTP site where randomUUID may be unavailable.
      const bytes = root.crypto.getRandomValues(new Uint8Array(16));
      const matchId = Array.from(bytes, n => n.toString(16).padStart(2, "0")).join("");
      const startedAt = new Date().toISOString();
      const versionId = this.versionId;
      let payload = null;
      return {
        matchId,
        finish: (details) => {
          if (payload === null) {
            payload = JSON.parse(JSON.stringify({
              result: details.result, score: details.score, metadata: details.metadata,
              match_id: matchId, version_id: versionId, started_at: startedAt,
              ended_at: new Date().toISOString(),
            }));
          }
          return this.submit(payload);
        },
        retry: () => {
          if (payload === null) return Promise.reject(new Error("请先调用 finish() 结算"));
          return this.submit(payload);
        },
        // Persist this snapshot yourself if retries must survive a reload.
        toJSON: () => payload && JSON.parse(JSON.stringify(payload)),
      };
    }
  }
  root.GameHubMatches = GameHubMatches;
})(window);
