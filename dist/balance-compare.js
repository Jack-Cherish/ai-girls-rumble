(() => {
  'use strict';

  const width = 2048, height = 1280;
  const foreground = '#f5f3ef', muted = '#b4b3c3', lime = '#edfa54';
  const neutral = [233, 231, 220], warm = [228, 153, 110], cool = [107, 205, 181];
  const number = new Intl.NumberFormat('zh-CN');
  const percent = rate => (rate * 100).toFixed(1) + '%';
  const rgb = ([r, g, b]) => `rgb(${r},${g},${b})`;

  function heat(rate) {
    const strength = Math.min(1, Math.abs(rate - .5) / .36) * .93;
    const color = rate < .5 ? warm : cool;
    return rgb(neutral.map((value, i) => Math.round(value + (color[i] - value) * strength)));
  }

  function draw(canvas, fighters, before, after, verified) {
    canvas.width = width;
    canvas.height = height;
    const c = canvas.getContext('2d');
    const n = fighters.length;
    const format = value => number.format(value);

    function label(text, x, y, size, color = foreground, weight = 400, align = 'left', maxWidth) {
      c.fillStyle = color;
      c.font = `${weight} ${size}px system-ui, "Microsoft YaHei", "Noto Sans CJK SC", sans-serif`;
      c.textBaseline = 'middle';
      c.textAlign = align;
      if (maxWidth) c.fillText(text, x, y, maxWidth);
      else c.fillText(text, x, y);
    }

    function box(x, y, w, h, radius, color, border) {
      c.beginPath();
      c.roundRect(x, y, w, h, radius);
      c.fillStyle = color;
      c.fill();
      if (border) {
        c.strokeStyle = border;
        c.lineWidth = 2;
        c.stroke();
      }
    }

    function polygon(points, color) {
      c.beginPath();
      c.moveTo(...points[0]);
      for (const point of points.slice(1)) c.lineTo(...point);
      c.closePath();
      c.fillStyle = color;
      c.fill();
    }

    function face(fighter, x, y, size) {
      const { name, image } = fighter;
      box(x, y, size, size, 6, '#343844');
      if (!image?.naturalWidth) {
        label(name.slice(0, 2), x + size / 2, y + size / 2, size * .36, foreground, 700, 'center', size - 4);
        return;
      }
      c.save();
      c.beginPath();
      c.roundRect(x, y, size, size, 6);
      c.clip();
      const crop = Math.min(image.naturalWidth, image.naturalHeight);
      c.drawImage(image, (image.naturalWidth - crop) / 2, (image.naturalHeight - crop) / 2, crop, crop, x, y, size, size);
      c.restore();
    }

    function line(x, y, w) {
      c.fillStyle = '#353540';
      c.fillRect(x, y, w, 1);
    }

    function panel(x, title, accent, summary) {
      const end = x + 947, top = 191;
      box(x, top, 947, 1016, 17, '#1d1d25', '#3b3b47');
      polygon([[x + 2, top + 18], [x + 17, top + 2], [x + 279, top + 2],
        [x + 266, top + 61], [x + 2, top + 61]], accent);
      label(title, x + 28, top + 32, 36, '#17201e', 800);
      const rates = summary.ranks.map(rank => rank.rate);
      label('角色胜率区间  ' + percent(Math.min(...rates)) + '–' + percent(Math.max(...rates)),
        end - 27, top + 32, 24, accent, 750, 'right');

      label('对阵热力图', x + 25, 287, 28, foreground, 750);
      label('行是 1P  ·  列是 2P  ·  格内为 1P 胜率', end - 27, 287, 19, muted, 400, 'right');
      line(x + 23, 309, 900);
      label('1P  /  2P', x + 24, 341, 17, muted, 700);
      const gridX = x + 152, gridY = 367, column = 768 / n, row = 504 / n;
      for (const [i, fighter] of fighters.entries()) {
        face(fighter, gridX + i * column + (column - 31) / 2, 322, 31);
        const y = gridY + i * row;
        face(fighter, x + 23, y + (row - 31) / 2, 31);
        label(fighter.name, x + 64, y + row / 2, 17, foreground, 700, 'left', 82);
        for (let j = 0; j < n; j++) {
          const { wins, n: matches } = summary.cells[i * n + j];
          const rate = wins / matches, cellX = gridX + j * column;
          box(cellX, y, column - 4, row - 4, 5, heat(rate));
          label(Math.round(rate * 100) + '%', cellX + (column - 4) / 2, y + (row - 4) / 2,
            19, '#132728', 750, 'center', column - 8);
        }
      }

      line(x + 24, 892, 899);
      label('各角色胜率', x + 25, 926, 28, foreground, 750);
      label('汇总双方位置 · 不含同角色对局', end - 27, 926, 18, muted, 400, 'right');
      const rows = Math.ceil(n / 2);
      for (const [i, fighter] of fighters.entries()) {
        const rowIndex = i % rows, y = 964 + rowIndex * (228 / rows);
        const x0 = x + 24 + Math.floor(i / rows) * 443;
        if (rowIndex % 2 === 0) box(x0 - 3, y - 15, 432, 30, 5, '#24242d');
        face(fighter, x0 + 5, y - 12, 24);
        label(fighter.name, x0 + 40, y, 19, foreground, 700, 'left', 109);
        const left = x0 + 156, track = 191, center = left + track / 2;
        const rate = rates[i], position = left + rate * track;
        box(left, y - 4, track, 8, 4, '#34343f');
        if (Math.abs(position - center) >= 1) {
          box(Math.min(position, center), y - 4, Math.abs(position - center), 8, 4, rgb(rate < .5 ? warm : cool));
        }
        c.fillStyle = '#a4a3ad';
        c.fillRect(center, y - 9, 1, 18);
        label(percent(rate), x0 + 415, y, 22, foreground, 750, 'right');
      }
    }

    c.fillStyle = '#14141a';
    c.fillRect(0, 0, width, height);
    c.fillStyle = '#191920';
    c.fillRect(0, 8, width, 159);
    c.fillStyle = lime;
    c.fillRect(0, 0, width, 8);
    c.fillStyle = '#343440';
    for (let x = 1450; x < width; x += 15) {
      for (let y = 22; y < 123; y += 15) c.fillRect(x, y, 1, 1);
    }
    polygon([[65, 48], [77, 48], [64, 106], [52, 106]], lime);
    label('万局平衡测试', 93, 76, 57, foreground, 800);
    label(`${n} 名角色  ·  每边 ${format(after.total)} 局  ·  每组对阵 ${format(after.total / (n * n))} 局`,
      94, 137, 23, muted);
    box(1665, 48, 319, 53, 9, '#282422', '#8a6d48');
    label(verified ? '同种子实测 · 已通过独立验证' : '同种子实测 · 候选配置', 1824.5, 74, 21, '#f3c887', 700, 'center');
    for (const [x, title, color] of [[1530, '1P 吃亏', warm], [1672, '接近五五开', neutral], [1851, '1P 占优', cool]]) {
      box(x, 130, 19, 16, 4, rgb(color));
      label(title, x + 27, 138, 20, muted);
    }
    line(64, 167, 1920);
    panel(64, '调整前', '#dedce8', before.summary);
    panel(1037, '调整后', lime, after.summary);
    label('实验种子  ' + after.seed, 64, 1244, 18, muted);
    label('胜率条竖线标记 50%', 1984, 1244, 18, muted, 400, 'right');
  }

  window.BalanceComparison = { draw };
})();
