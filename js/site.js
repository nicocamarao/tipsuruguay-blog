const root = document.body.dataset.root || "";

function leerCookie(nombre) {
  const encontrado = document.cookie.split("; ").find((parte) => parte.startsWith(`${nombre}=`));
  return encontrado ? decodeURIComponent(encontrado.slice(nombre.length + 1)) : "";
}

function guardarCookie(nombre, valor) {
  document.cookie = `${nombre}=${encodeURIComponent(valor)}; path=/; max-age=31536000; SameSite=Lax`;
}

function borrarCookie(nombre) {
  document.cookie = `${nombre}=; path=/; max-age=0; SameSite=Lax`;
}

function leerJson(nombre) {
  try {
    return JSON.parse(leerCookie(nombre) || "");
  } catch {
    return null;
  }
}

function paisActivo() {
  return leerCookie("tu_pais");
}

function hoyLocal() {
  const ahora = new Date();
  const local = new Date(ahora.getTime() - ahora.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function plano(texto) {
  return texto.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
}

function fecha(iso) {
  const [anio, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${anio}`;
}

function vigente(oferta, hoy) {
  return oferta.vigencia_hasta >= hoy;
}

async function cargarOfertas() {
  const catalogo = await fetch(`${root}data/ofertas/catalogo.json`).then((respuesta) => respuesta.json());
  const ofertas = await Promise.all(
    catalogo.archivos.map((archivo) =>
      fetch(`${root}data/ofertas/${archivo}`).then((respuesta) => respuesta.json())
    )
  );
  return ofertas.sort((a, b) => a.salida.localeCompare(b.salida));
}

let filtroMes = "";
let vocesGlobal = null;

function ofertaVisible(oferta, hoy, tipo) {
  const pais = paisActivo();
  const mesOk = !filtroMes || (oferta.salida || "").slice(0, 7) === filtroMes;
  return vigente(oferta, hoy) && (!tipo || oferta.tipo === tipo) && (!pais || (oferta.paises || []).includes(pais)) && mesOk;
}

function reaccionesDe(likes, clave) {
  const valor = likes[clave];
  if (Array.isArray(valor)) return new Set(valor);
  if (typeof valor === "string" && valor) return new Set([valor]);
  return new Set();
}

function botonesReaccion(clave, bases) {
  const caja = document.createElement("div");
  caja.className = "reacciones";
  const guardados = reaccionesDe(leerJson("tu_likes") || {}, clave);
  const numeros = bases || { corazon: 0, idea: 0 };
  [["corazon", "♥", "Me gusta"], ["idea", "✦", "Buena idea"]].forEach(([tipo, simbolo, etiqueta]) => {
    const boton = document.createElement("button");
    boton.type = "button";
    const activo = guardados.has(tipo);
    boton.className = activo ? "activa" : "";
    boton.setAttribute("aria-pressed", activo ? "true" : "false");
    boton.setAttribute("aria-label", etiqueta);
    const cantidad = (numeros[tipo] || 0) + (activo ? 1 : 0);
    boton.innerHTML = `<span aria-hidden="true">${simbolo}</span> ${etiqueta} <span class="cuenta">${cantidad}</span>`;
    boton.addEventListener("click", (evento) => {
      evento.preventDefault();
      evento.stopPropagation();
      const likes = leerJson("tu_likes") || {};
      const marcas = reaccionesDe(likes, clave);
      if (marcas.has(tipo)) marcas.delete(tipo);
      else marcas.add(tipo);
      if (marcas.size) likes[clave] = [...marcas];
      else delete likes[clave];
      guardarCookie("tu_likes", JSON.stringify(likes));
      caja.replaceWith(botonesReaccion(clave, numeros));
    });
    caja.append(boton);
  });
  return caja;
}

function tarjeta(oferta) {
  const pieza = document.createElement("article");
  pieza.className = "card";
  const enlace = document.createElement("a");
  enlace.href = `${root}oferta.html?id=${encodeURIComponent(oferta.id)}`;
  const foto = oferta.imagen
    ? `<img class="card-foto" src="${root}${oferta.imagen}" alt="${oferta.titulo}">`
    : "";
  enlace.innerHTML = `
    ${foto}
    <div class="card-cuerpo">
      <span class="tag">${etiquetaTipo(oferta.tipo)}</span>
      <h3>${oferta.titulo}</h3>
      <p class="price">${oferta.precio}</p>
      <p>${oferta.precio_nota}</p>
      <p class="meta">${oferta.origen} · ${fecha(oferta.salida)} al ${fecha(oferta.regreso)}</p>
      <p class="meta">${(oferta.paises || []).join(" · ")}</p>
    </div>`;
  pieza.append(enlace, botonesReaccion(`oferta:${oferta.id}`, basesLike(oferta)));
  return pieza;
}

function pintarOfertas(ofertas) {
  const hoy = hoyLocal();
  document.querySelectorAll("[data-ofertas]").forEach((contenedor) => {
    const tipo = contenedor.dataset.tipo || "";
    const lista = ofertas.filter((oferta) => ofertaVisible(oferta, hoy, tipo));
    contenedor.replaceChildren();
    if (!lista.length) {
      contenedor.textContent = paisActivo()
        ? `No hay salidas para ${paisActivo()} en este momento.`
        : "No hay salidas en esta sección en este momento.";
      return;
    }
    lista.forEach((oferta) => contenedor.append(tarjeta(oferta)));
  });
  pintarVoces(ofertas);
}

function enlaceReferido(oferta, plataformas) {
  const plataforma = plataformas[oferta.plataforma];
  if (!plataforma || !plataforma.plantilla) return oferta.url;
  const datos = {
    id: plataforma.id || "",
    destino: encodeURIComponent(oferta.destino),
    origen: encodeURIComponent(oferta.origen),
    salida: oferta.salida,
    regreso: oferta.regreso
  };
  return plataforma.plantilla.replace(/\{(\w+)\}/g, (_, clave) => datos[clave] ?? "");
}

function etiquetaTipo(tipo) {
  return { avion: "Avión", crucero: "Crucero", paquete: "Paquete" }[tipo] || "Salida";
}

function textoOferta(oferta, hoy, plataformas) {
  const estado = vigente(oferta, hoy)
    ? `Conviene verla antes del ${fecha(oferta.vigencia_hasta)}.`
    : `Esa salida ya pasó.`;
  const link = plataformas ? ` Puedes verla aquí: ${enlaceReferido(oferta, plataformas)}` : "";
  return `Del ${fecha(oferta.salida)} al ${fecha(oferta.regreso)}, ${oferta.precio} con ${oferta.plataforma}. ${estado}${link}`;
}

function agrupar(ofertas) {
  const grupos = new Map();
  ofertas.forEach((oferta) => {
    const nombre = oferta.agente || oferta.destino;
    if (!grupos.has(nombre)) grupos.set(nombre, []);
    grupos.get(nombre).push(oferta);
  });
  return grupos;
}

function textoDestino(nombre, lista, hoy, plataformas) {
  const fechas = lista
    .slice()
    .sort((a, b) => a.salida.localeCompare(b.salida))
    .map((oferta) => textoOferta(oferta, hoy, plataformas))
    .join(" ");
  const intro = lista.length > 1 ? `${nombre} tiene más de una fecha.` : `${nombre}.`;
  return `${intro} ${fechas}`;
}

function responder(mensaje, ofertas, respuestas, plataformas, agente) {
  const consulta = plano(mensaje);
  const hoy = hoyLocal();
  const propias = agente
    ? ofertas.filter((oferta) => (oferta.agente || oferta.destino) === agente)
    : [];
  if (agente && propias.length) {
    const pideFecha = ["fecha", "fechas", "cuando", "cuándo", "sale", "salida", "vuelve", "dia", "día"].some((palabra) => consulta.includes(palabra));
    const pidePrecio = ["precio", "cuesta", "tarifa", "valor"].some((palabra) => consulta.includes(palabra));
    const pideLink = ["link", "enlace", "reserv", "referido"].some((palabra) => consulta.includes(palabra));
    const pideIncluye = ["incluye", "equipaje", "valija", "no incluye"].some((palabra) => consulta.includes(palabra));
    if (pideFecha || pidePrecio || pideLink || !consulta) {
      return textoDestino(agente, propias, hoy, plataformas);
    }
    if (pideIncluye) {
      return propias.map((oferta) => `${fecha(oferta.salida)}: ${oferta.incluye} No incluye: ${oferta.no_incluye}`).join(" ");
    }
    return textoDestino(agente, propias, hoy, plataformas);
  }
  const coincidencias = (agente ? propias : ofertas).filter((oferta) =>
    oferta.palabras.some((palabra) => consulta.includes(plano(palabra))) ||
    plano(oferta.agente || oferta.destino).includes(consulta) ||
    consulta.includes(plano(oferta.agente || oferta.destino))
  );
  if (coincidencias.length) {
    return [...agrupar(coincidencias).entries()].map(([nombre, lista]) => textoDestino(nombre, lista, hoy, plataformas)).join(" ");
  }
  if (consulta.includes("crucero")) {
    const cruceros = ofertas.filter((oferta) => oferta.tipo === "crucero");
    if (cruceros.length) return cruceros.map((oferta) => textoOferta(oferta, hoy)).join(" ");
  }
  if (consulta.includes("avion") || consulta.includes("vuelo")) {
    const vuelos = ofertas.filter((oferta) => oferta.tipo === "avion");
    if (vuelos.length) return vuelos.map((oferta) => textoOferta(oferta, hoy)).join(" ");
  }
  if (["oferta", "ofertas", "descuento", "descuentos", "que hay"].some((palabra) => consulta.includes(palabra))) {
    const activas = ofertas.filter((oferta) => vigente(oferta, hoy));
    if (!activas.length) return "En este momento no hay salidas para contar.";
    return activas.map((oferta) => `${oferta.titulo}: ${oferta.precio}. Conviene verla antes del ${fecha(oferta.vigencia_hasta)}.`).join(" ");
  }
  const claves = Object.values(respuestas).flatMap((item) => item.claves.map((clave) => ({ clave, texto: item.texto })));
  claves.sort((a, b) => plano(b.clave).length - plano(a.clave).length);
  const grupo = claves.find((item) => consulta.includes(plano(item.clave)));
  if (grupo) return grupo.texto;
  return "De eso no tengo algo para contarte. Puedes preguntarme por Nicolás, por Tips Uruguay, o por una salida: Florianópolis, Punta Cana, Buenos Aires o el Costa Serena.";
}

function armarChat(ofertas, respuestas, plataformas) {
  const boton = document.createElement("button");
  boton.className = "chat-launcher";
  boton.type = "button";
  boton.textContent = "Preguntar";
  const panel = document.createElement("section");
  panel.className = "chat-panel";
  panel.innerHTML = `
    <header><strong>Tips Uruguay</strong><button type="button" aria-label="Cerrar">Cerrar</button></header>
    <div class="agentes"></div>
    <div class="chat-log"></div>
    <form class="chat-form"><input name="mensaje" autocomplete="off" placeholder="Un destino, una fecha, un precio…" aria-label="Mensaje"><button type="submit">Enviar</button></form>`;
  const log = panel.querySelector(".chat-log");
  const cinta = panel.querySelector(".agentes");
  let agente = "";
  const escribir = (texto, clase) => {
    const parrafo = document.createElement("p");
    parrafo.className = `burbuja ${clase}`;
    parrafo.textContent = texto;
    log.append(parrafo);
    log.scrollTop = log.scrollHeight;
  };
  const general = document.createElement("button");
  general.type = "button";
  general.textContent = "Todo";
  general.className = "activa";
  general.addEventListener("click", () => {
    agente = "";
    cinta.querySelectorAll("button").forEach((item) => item.classList.toggle("activa", item === general));
    escribir("Puedes preguntarme por cualquier destino.", "bot");
  });
  cinta.append(general);
  agrupar(ofertas).forEach((lista, nombre) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.textContent = nombre;
    chip.addEventListener("click", () => {
      agente = nombre;
      cinta.querySelectorAll("button").forEach((item) => item.classList.toggle("activa", item === chip));
      escribir(textoDestino(nombre, lista, hoyLocal(), plataformas), "bot");
    });
    cinta.append(chip);
  });
  escribir("Si quieres, elige un destino y te cuento lo que hay.", "bot");
  boton.addEventListener("click", () => {
    document.querySelector(".mapa-panel")?.classList.remove("abierto");
    document.querySelector(".mapa-launcher")?.classList.remove("activa");
    panel.classList.toggle("abierto");
    boton.classList.toggle("activa", panel.classList.contains("abierto"));
    if (panel.classList.contains("abierto")) panel.querySelector("input").focus();
  });
  panel.querySelector("header button").addEventListener("click", () => panel.classList.remove("abierto"));
  panel.querySelector("form").addEventListener("submit", (evento) => {
    evento.preventDefault();
    const entrada = panel.querySelector("input");
    const mensaje = entrada.value.trim();
    if (!mensaje) return;
    escribir(mensaje, "user");
    escribir(responder(mensaje, ofertas, respuestas, plataformas, agente), "bot");
    entrada.value = "";
  });
  document.body.append(boton, panel);
  armarMapa(ofertas);
}

function cargarLeaflet() {
  if (window.L) return Promise.resolve();
  if (!document.querySelector("link[data-leaflet]")) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = `${root}vendor/leaflet/leaflet.css`;
    link.dataset.leaflet = "1";
    document.head.append(link);
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `${root}vendor/leaflet/leaflet.js`;
    script.onload = () => resolve();
    script.onerror = reject;
    document.body.append(script);
  });
}

function estiloPais(feature) {
  const activo = feature.properties.pais === paisActivo();
  return {
    color: activo ? "#083eb8" : "#8eb0e8",
    weight: activo ? 2 : 1,
    fillColor: activo ? "#0b57f0" : "#d6e6ff",
    fillOpacity: activo ? 0.65 : 0.4
  };
}

function armarMapa(ofertas) {
  const boton = document.createElement("button");
  boton.type = "button";
  boton.className = "mapa-launcher";
  boton.textContent = "Mapa";
  const panel = document.createElement("section");
  panel.className = "mapa-panel";
  panel.innerHTML = `<header><strong>Mapa</strong><button type="button">Cerrar</button></header><div class="mapa-lienzo"></div><p class="mapa-estado"></p>`;
  const estado = panel.querySelector(".mapa-estado");
  const pintarEstado = () => {
    estado.textContent = paisActivo()
      ? `Mostrando ${paisActivo()}. Toca ese país otra vez para ver todas las salidas.`
      : "Pasa el mouse para pintar un país. Un clic filtra las salidas.";
  };
  pintarEstado();
  let mapa = null;
  let capa = null;
  boton.addEventListener("click", async () => {
    document.querySelector(".chat-panel")?.classList.remove("abierto");
    panel.classList.toggle("abierto");
    boton.classList.toggle("activa", panel.classList.contains("abierto"));
    if (!panel.classList.contains("abierto")) return;
    await cargarLeaflet();
    if (!mapa) {
      const lienzo = panel.querySelector(".mapa-lienzo");
      mapa = window.L.map(lienzo, { minZoom: 2, maxZoom: 6 }).setView([-32.5, -56], 2);
      window.L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap",
        maxZoom: 6
      }).addTo(mapa);
      const datos = await fetch(`${root}data/mapa/paises.geojson`).then((respuesta) => respuesta.json());
      capa = window.L.geoJSON(datos, {
        style: estiloPais,
        onEachFeature(feature, layer) {
          layer.on("mouseover", () => layer.setStyle({ fillColor: "#0b57f0", fillOpacity: 0.55, weight: 1.5 }));
          layer.on("mouseout", () => capa.resetStyle(layer));
          layer.on("click", () => {
            const pais = feature.properties.pais;
            if (paisActivo() === pais) borrarCookie("tu_pais");
            else guardarCookie("tu_pais", pais);
            capa.setStyle(estiloPais);
            pintarOfertas(ofertas);
            pintarEstado();
          });
        }
      }).addTo(mapa);
    }
    window.setTimeout(() => mapa.invalidateSize(), 80);
  });
  panel.querySelector("header button").addEventListener("click", () => {
    panel.classList.remove("abierto");
    boton.classList.remove("activa");
  });
  document.body.append(boton, panel);
}

async function mostrarFicha(plataformas) {
  const ficha = document.querySelector("[data-ficha]");
  if (!ficha) return;
  const id = new URLSearchParams(location.search).get("id");
  const ofertas = await cargarOfertas();
  const oferta = ofertas.find((item) => item.id === id);
  if (!oferta) {
    ficha.textContent = "No encontré esa salida.";
    return;
  }
  const hoy = hoyLocal();
  const plazo = vigente(oferta, hoy)
    ? `Si te gusta, conviene mirarla antes del ${fecha(oferta.vigencia_hasta)}.`
    : `Esta salida ya pasó.`;
  const referido = enlaceReferido(oferta, plataformas);
  const portada = oferta.imagen
    ? `<img class="card-foto ficha-foto" src="${root}${oferta.imagen}" alt="${oferta.titulo}">`
    : "";
  ficha.innerHTML = `
    ${portada}
    <p class="kicker">${etiquetaTipo(oferta.tipo)} · ${oferta.plataforma}</p>
    <h1>${oferta.titulo}</h1>
    <p class="price">${oferta.precio}</p>
    <p>${oferta.precio_nota}</p>
    <p>Sale de ${oferta.origen} el ${fecha(oferta.salida)} y vuelve el ${fecha(oferta.regreso)}. El destino es ${oferta.destino}.</p>
    <p>${plazo}</p>
    <p>${oferta.incluye} Lo que queda afuera: ${oferta.no_incluye}</p>
    <p class="callout">${oferta.fuente}</p>
    ${listaEquipaje(oferta)}
    <p><a class="precio-final" href="${referido}">Precio final ${oferta.precio} en ${oferta.plataforma}</a></p>`;
  if (oferta.foto) {
    const figura = document.createElement("figure");
    figura.className = "foto-viaje";
    figura.innerHTML = `<img src="${root}${oferta.foto.src}" alt="${oferta.foto.texto}"><figcaption>${oferta.foto.nombre} · ${oferta.foto.pais}. ${oferta.foto.texto} ${oferta.foto.credito}</figcaption>`;
    ficha.append(figura);
  }
  ficha.append(botonesReaccion(`oferta:${oferta.id}`, basesLike(oferta)));
  pintarComentariosOferta(ficha, oferta);
}

function armarCubo(ofertas) {
  const escena = document.querySelector("[data-cubo]");
  if (!escena) return;
  const conFoto = ofertas.filter((oferta) => oferta.imagen && vigente(oferta, hoyLocal()));
  if (!conFoto.length) return;
  const seis = [];
  while (seis.length < 6) seis.push(conFoto[seis.length % conFoto.length]);
  const clases = ["frente", "derecha", "atras", "izquierda", "arriba", "abajo"];
  const poses = [[0, 0], [0, -90], [0, -180], [0, 90], [-90, 0], [90, 0]];
  const enlace = document.createElement("a");
  enlace.className = "cubo-enlace";
  const cubo = document.createElement("div");
  cubo.className = "cubo";
  const titulo = document.createElement("p");
  titulo.className = "cubo-titulo";
  seis.forEach((oferta, indice) => {
    const cara = document.createElement("span");
    cara.className = `cara ${clases[indice]}`;
    cara.innerHTML = `<img src="${root}${oferta.imagen}" alt="">`;
    cubo.append(cara);
  });
  enlace.append(cubo);
  escena.append(enlace, titulo);
  let rotX = -18;
  let rotY = 24;
  let visible = 0;
  const pintar = () => {
    cubo.style.transform = `rotateX(${rotX}deg) rotateY(${rotY}deg)`;
    enlace.href = `${root}oferta.html?id=${encodeURIComponent(seis[visible].id)}`;
    enlace.setAttribute("aria-label", seis[visible].titulo);
    titulo.textContent = seis[visible].titulo;
  };
  const girar = () => {
    let indice = visible;
    while (indice === visible) indice = Math.floor(Math.random() * poses.length);
    const ax = ((rotX % 360) + 360) % 360;
    const ay = ((rotY % 360) + 360) % 360;
    let [tx, ty] = poses[indice];
    tx = (tx + 360) % 360;
    ty = (ty + 360) % 360;
    let dx = tx - ax;
    let dy = ty - ay;
    if (dx > 180) dx -= 360;
    if (dx < -180) dx += 360;
    if (dy > 180) dy -= 360;
    if (dy < -180) dy += 360;
    if (Math.random() < 0.5) dx += dx >= 0 ? -360 : 360;
    dy += Math.random() < 0.5 ? 360 : -360;
    rotX += dx;
    rotY += dy;
    visible = indice;
    pintar();
  };
  pintar();
  const reducido = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reducido) return;
  let timer = window.setInterval(girar, 3400);
  escena.addEventListener("mouseenter", () => window.clearInterval(timer));
  escena.addEventListener("mouseleave", () => {
    window.clearInterval(timer);
    timer = window.setInterval(girar, 3400);
  });
  window.setTimeout(girar, 1200);
}

function basesLike(oferta) {
  return oferta.likes || (vocesGlobal && vocesGlobal.likesOferta && vocesGlobal.likesOferta[oferta.id]) || { corazon: 6, idea: 2 };
}

const iconos = {
  personal: '<svg viewBox="0 0 24 24"><path d="M8 7h8v13H8z"/><path d="M10 7V5.5A1.5 1.5 0 0 1 11.5 4h1A1.5 1.5 0 0 1 14 5.5V7"/></svg>',
  cabina: '<svg viewBox="0 0 24 24"><rect x="6" y="7" width="12" height="12" rx="2"/><path d="M9 7V5h6v2M9 19v2M15 19v2"/></svg>',
  valija: '<svg viewBox="0 0 24 24"><rect x="5" y="7" width="14" height="12" rx="2"/><path d="M9 7V5h6v2M12 11v4"/></svg>',
  bus: '<svg viewBox="0 0 24 24"><rect x="4" y="6" width="16" height="10" rx="2"/><path d="M7 16v2M17 16v2M4 12h16"/></svg>',
  barco: '<svg viewBox="0 0 24 24"><path d="M4 16l2 3h12l2-3M6 16V9h8l4 4"/><path d="M10 9V5h2"/></svg>',
  cama: '<svg viewBox="0 0 24 24"><path d="M4 18V8M4 14h16v4M8 14V10h8a4 4 0 0 1 4 4"/></svg>',
  comida: '<svg viewBox="0 0 24 24"><path d="M8 3v8M6 3v5a2 2 0 0 0 4 0V3M8 11v10M16 3c2 2 2 4 0 6v12"/></svg>',
  bebida: '<svg viewBox="0 0 24 24"><path d="M8 3h8l-1 8H9zM12 11v7M8 21h8"/></svg>'
};

function listaEquipaje(oferta) {
  if (!oferta.equipaje) return "";
  return `<ul class="equipaje">${oferta.equipaje.map((item) => `<li class="${item.estado}"><span class="ico">${iconos[item.icono] || ""}</span><span>${item.texto}</span></li>`).join("")}</ul>`;
}

const banderas = { Uruguay: "🇺🇾", Argentina: "🇦🇷", Brasil: "🇧🇷", "República Dominicana": "🇩🇴" };

function iniciales(nombre) {
  return nombre.split(" ").slice(0, 2).map((parte) => parte[0] || "").join("").toUpperCase();
}

function contador(clave, base) {
  const boton = document.createElement("button");
  boton.type = "button";
  boton.className = "contador";
  const pintar = () => {
    const puesto = reaccionesDe(leerJson("tu_likes") || {}, clave).has("corazon");
    boton.classList.toggle("activa", puesto);
    boton.textContent = `♥ ${base + (puesto ? 1 : 0)}`;
  };
  boton.addEventListener("click", (evento) => {
    evento.preventDefault();
    evento.stopPropagation();
    const likes = leerJson("tu_likes") || {};
    const marcas = reaccionesDe(likes, clave);
    if (marcas.has("corazon")) marcas.delete("corazon");
    else marcas.add("corazon");
    if (marcas.size) likes[clave] = [...marcas];
    else delete likes[clave];
    guardarCookie("tu_likes", JSON.stringify(likes));
    pintar();
  });
  pintar();
  return boton;
}

function bloqueVoz(item) {
  const pieza = document.createElement("article");
  pieza.className = `voz${item.tipo === "resena" ? " resena" : ""}`;
  const cabeza = document.createElement("header");
  const tono = (item.nombre || "A").charCodeAt(0) * 17 % 360;
  cabeza.innerHTML = `<span class="avatar" style="--t:${tono}">${iniciales(item.nombre || "?")}</span><strong></strong><span class="bandera"></span><time></time>`;
  cabeza.querySelector("strong").textContent = item.nombre || "Viajero";
  cabeza.querySelector(".bandera").textContent = `${banderas[item.pais] || ""} ${item.pais || ""}`.trim();
  cabeza.querySelector("time").textContent = item.cuando || "";
  const texto = document.createElement("p");
  texto.textContent = item.texto || "";
  pieza.append(cabeza, texto, contador(`voz:${item.id}`, item.likes || 0));
  return pieza;
}

function comentariosVisibles(ofertaId) {
  const propios = leerJson("tu_notas") || [];
  const base = (vocesGlobal && vocesGlobal.comentarios) || [];
  const todos = base.concat(propios);
  const pais = paisActivo();
  return todos.filter((item) => (!ofertaId || item.oferta === ofertaId) && (!pais || item.pais === pais || !item.pais));
}

function armarCajaComentarios(oferta) {
  const caja = document.createElement("section");
  caja.className = "hilos";
  const titulo = document.createElement("h2");
  titulo.textContent = "Comentarios y reseñas";
  caja.append(titulo);
  const lista = comentariosVisibles(oferta.id);
  if (!lista.length) {
    const vacio = document.createElement("p");
    vacio.textContent = "Todavía no hay notas de viajeros para esta salida.";
    caja.append(vacio);
  }
  lista.forEach((item) => caja.append(bloqueVoz(item)));
  const form = document.createElement("form");
  form.className = "comentario-form";
  form.innerHTML = `<h3>Dejar una nota</h3><input name="nombre" placeholder="Tu nombre" required><select name="pais"><option>Uruguay</option><option>Argentina</option><option>Brasil</option></select><select name="tipo"><option value="comentario">Comentario</option><option value="resena">Reseña</option></select><textarea name="texto" required placeholder="Qué te pareció el precio, el equipaje o la compra"></textarea><button type="submit">Publicar</button>`;
  form.addEventListener("submit", (evento) => {
    evento.preventDefault();
    const datos = new FormData(form);
    const guardados = leerJson("tu_notas") || [];
    guardados.push({
      id: `local-${Date.now()}`,
      nombre: datos.get("nombre"),
      pais: datos.get("pais"),
      tipo: datos.get("tipo"),
      texto: datos.get("texto"),
      cuando: "octubre 2026",
      oferta: oferta.id,
      likes: 0
    });
    guardarCookie("tu_notas", JSON.stringify(guardados));
    const nueva = armarCajaComentarios(oferta);
    caja.replaceWith(nueva);
  });
  caja.append(form);
  return caja;
}

function pintarComentariosOferta(ficha, oferta) {
  ficha.append(armarCajaComentarios(oferta));
}

function pintarVoces(ofertas) {
  if (!vocesGlobal) return;
  const ids = new Set((ofertas || []).filter((oferta) => ofertaVisible(oferta, hoyLocal(), "")).map((oferta) => oferta.id));
  document.querySelectorAll("[data-voces]").forEach((caja) => {
    caja.replaceChildren();
    const titulo = document.createElement("h2");
    titulo.textContent = "Lo que cuenta la gente";
    caja.append(titulo);
    const muestra = (vocesGlobal.comentarios || []).filter((item) => !ids.size || ids.has(item.oferta)).slice(0, 6);
    muestra.forEach((item) => caja.append(bloqueVoz(item)));
  });
  const mesa = document.querySelector("[data-hilos]");
  if (!mesa) return;
  mesa.replaceChildren();
  const kicker = document.createElement("p");
  kicker.className = "kicker";
  kicker.textContent = "La mesa";
  const h2 = document.createElement("h2");
  h2.textContent = "Hilos";
  mesa.append(kicker, h2);
  (vocesGlobal.testimonios || []).forEach((item) => mesa.append(bloqueVoz(item)));
  (vocesGlobal.hilos || []).forEach((hilo) => {
    const bloque = document.createElement("section");
    bloque.className = "hilo";
    const cabeza = document.createElement("header");
    const titulo = document.createElement("h3");
    titulo.textContent = hilo.titulo;
    cabeza.append(titulo, contador(`hilo:${hilo.id}`, hilo.likes || 0));
    bloque.append(cabeza);
    (hilo.posts || []).forEach((post) => bloque.append(bloqueVoz(post)));
    mesa.append(bloque);
  });
}

function armarFiltros(ofertas) {
  document.querySelectorAll("[data-ofertas]").forEach((contenedor) => {
    if (contenedor.previousElementSibling && contenedor.previousElementSibling.classList.contains("filtros")) return;
    const barra = document.createElement("div");
    barra.className = "filtros";
    const tipoFijo = contenedor.dataset.tipo || "";
    const tipos = tipoFijo ? [] : [["", "Todas"], ["avion", "Avión"], ["crucero", "Crucero"], ["paquete", "Día y paquete"]];
    const meses = [...new Set(ofertas.map((oferta) => oferta.salida.slice(0, 7)))].sort();
    const chips = [{ clave: "mes", valor: "", texto: "Cualquier fecha" }].concat(meses.map((mes) => ({ clave: "mes", valor: mes, texto: mes })));
    tipos.forEach(([valor, texto]) => chips.unshift({ clave: "tipo", valor, texto }));
    chips.forEach((chip) => {
      if (chip.clave === "tipo" && tipoFijo) return;
      const boton = document.createElement("button");
      boton.type = "button";
      boton.textContent = chip.texto;
      boton.addEventListener("click", () => {
        if (chip.clave === "mes") filtroMes = chip.valor;
        if (chip.clave === "tipo") contenedor.dataset.tipo = chip.valor;
        barra.querySelectorAll("button").forEach((item) => item.classList.remove("activa"));
        boton.classList.add("activa");
        pintarOfertas(ofertas);
      });
      barra.append(boton);
    });
    contenedor.before(barra);
  });
}

function armarCielo() {
  if (document.querySelector(".cielo")) return;
  const cielo = document.createElement("div");
  cielo.className = "cielo";
  cielo.setAttribute("aria-hidden", "true");
  cielo.innerHTML = '<span class="nube n1"></span><span class="nube n2"></span><span class="nube n3"></span><span class="avion-fondo"></span>';
  document.body.prepend(cielo);
}

async function iniciar() {
  try {
    armarCielo();
    const [ofertas, respuestas, plataformas, voces] = await Promise.all([
      cargarOfertas(),
      fetch(`${root}data/chat/respuestas.json`).then((respuesta) => respuesta.json()),
      fetch(`${root}data/referidos/plataformas.json`).then((respuesta) => respuesta.json()),
      fetch(`${root}data/comunidad/voces.json`).then((respuesta) => respuesta.json())
    ]);
    vocesGlobal = voces;
    armarFiltros(ofertas);
    pintarOfertas(ofertas);
    armarCubo(ofertas);
    armarChat(ofertas, respuestas, plataformas);
    await mostrarFicha(plataformas);
  } catch (error) {
    console.error(error);
  }
}

iniciar();
