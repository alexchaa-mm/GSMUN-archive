import { randomUUID } from "node:crypto";

/** Contract double, NOT proof of live PostgreSQL/RLS enforcement. */
export function bookDatabaseDefaults(book){return {cover_color:"#103d32",accent_color:"#f0cd36",ink_color:"#f5f1e7",motif:"lattice",quote:"",quote_by:"",living:false,legacy_metadata:{},cover_asset_id:null,spine_asset_id:null,back_asset_id:null,...book};}
export function fakeDatabase() {
  const tables = Object.fromEntries(["books", "archives", "sections", "photos", "assets", "archive_navigation", "drive_import_jobs", "drive_folder_mappings", "drive_sync_state"].map(name => [name, []]));
  const objects = new Map(); const calls = [];
  const state = { role: "admin", configured: true, loginError: null, fail: null, failStorage: null, signOuts: 0, maxReturned: 0 };
  const result = (data = null, error = null, count) => ({ data, error, count });
  class Query {
    constructor(entity) { this.entity = entity; this.filters = []; this.orders = []; this.offset = 0; this.end = Infinity; this.mode = "read"; }
    select() { return this; }
    eq(key, value) { this.filters.push(row => row[key] === value); return this; }
    is(key, value) { this.filters.push(row => (row[key] ?? null) === value); return this; }
    neq(key, value) { this.filters.push(row => row[key] !== value); return this; }
    lte(key, value) { this.filters.push(row => row[key] != null && row[key] <= value); return this; }
    like(key, value) {const pattern=new RegExp("^"+value.split("%").map(part=>part.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")).join(".*")+"$");this.filters.push(row=>pattern.test(String(row[key] ?? "")));return this;}
    in(key, values) { this.filters.push(row => values.includes(row[key])); return this; }
    order(key, options = {}) { this.orders.push([key, options.ascending !== false]); return this; }
    range(start, end) { this.offset = start; this.end = end; return this; }
    limit(size) { this.end = this.offset + size - 1; return this; }
    or(expression) {
      const cursor=/^sort_order\.(gt|lt)\.(\d+),and\(sort_order\.eq\.(\d+),id\.(gt|lt)\.([a-zA-Z0-9_-]+)\)$/.exec(expression);
      if(cursor){this.filters.push(row=>(cursor[1]==="gt" ? row.sort_order>Number(cursor[2]) : row.sort_order<Number(cursor[2])) || (row.sort_order===Number(cursor[3]) && (cursor[4]==="gt" ? row.id>cursor[5] : row.id<cursor[5])));return this;}
      const clauses = [...expression.matchAll(/(\w+)\.ilike\."((?:\\.|[^"\\])*)"/g)].map(match => [match[1], match[2].slice(1, -1).replace(/\\(.)/g, "$1").toLowerCase()]);
      const scopes=[...expression.matchAll(/(\w+)\.in\.\(([^)]+)\)/g)].map(match=>[match[1],match[2].split(",")]);
      this.filters.push(row => clauses.some(([key, value]) => String(row[key] ?? "").toLowerCase().includes(value)) || scopes.some(([key,values])=>values.includes(row[key]))); return this;
    }
    insert(value) { this.mode = "insert"; this.value = value; return this; }
    upsert(value, options) { this.mode = "upsert"; this.value = value; this.upsertOptions = options; return this; }
    update(value) { this.mode = "update"; this.value = value; return this; }
    delete() { this.mode = "delete"; return this; }
    async single() { const answer = await this.execute(); return answer.error ? answer : answer.data.length === 1 ? { ...answer, data: answer.data[0] } : result(null, { code: "PGRST116" }); }
    async maybeSingle() { const answer = await this.execute(); return answer.error ? answer : answer.data.length > 1 ? result(null, { code: "PGRST116" }) : { ...answer, data: answer.data[0] ?? null }; }
    then(resolve, reject) { return this.execute().then(resolve, reject); }
    async execute() {
      calls.push({ entity: this.entity, mode: this.mode, value: this.value });
      if (state.fail?.(this.entity, this.mode, this.value)) return result(null, { code: "NETWORK" });
      if (this.mode !== "read" && state.role !== "admin") return result(null, { code: "42501" });
      const source = tables[this.entity]; let selected = source.filter(row => this.filters.every(filter => filter(row)));
      // Model the expected publication boundary for offline contract tests only.
      // This does NOT establish that real PostgreSQL policies are installed.
      if(this.mode==="read" && state.role!=="admin") {
        const bookPublic=id=>tables.books.some(book=>book.id===id && book.status==="published") && tables.archives.some(archive=>archive.book_id===id && archive.status==="published");
        const sectionPublic=id=>tables.sections.some(section=>section.id===id && section.status==="published" && tables.archives.some(archive=>archive.id===section.archive_id && bookPublic(archive.book_id)));
        const photoPublic=photo=>photo.status==="published" && sectionPublic(photo.section_id);
        selected=selected.filter(row=>this.entity==="archive_navigation" ? row.key==="published" : this.entity.startsWith("drive_") ? false : this.entity==="books" ? bookPublic(row.id) : this.entity==="archives" ? row.status==="published" && bookPublic(row.book_id) : this.entity==="sections" ? sectionPublic(row.id) : this.entity==="photos" ? photoPublic(row) : row.processing_status==="ready" && (tables.photos.some(photo=>photo.asset_id===row.id && photoPublic(photo)) || tables.books.some(book=>[book.cover_asset_id,book.spine_asset_id,book.back_asset_id].includes(row.id) && bookPublic(book.id))));
      }
      if (this.mode === "upsert") {
        if (!this.upsertOptions.ignoreDuplicates) throw new Error("The contract store only supports non-overwriting import upserts");
        selected = [];
        for (const input of this.value) {
          if (source.some(row => row[this.upsertOptions.onConflict] === input[this.upsertOptions.onConflict])) continue;
          const value = { created_at: new Date().toISOString(), ...input }; source.push(value); selected.push(value);
        }
      }
      if (this.mode === "insert") {
        const value = { id: randomUUID(), status: "draft", created_at: new Date().toISOString(), updated_at: new Date().toISOString(), caption: "", credit: "", credit_url: "", variants: {}, ...this.value };
        if (source.some(row => row.id === value.id || (value.slug && row.slug === value.slug && (this.entity !== "sections" || row.archive_id === value.archive_id)) || (this.entity==="archive_navigation" && row.key===value.key) || (this.entity==="drive_import_jobs" && row.drive_file_id===value.drive_file_id))) return result(null, { code: "23505" });
        if (this.entity === "photos" && (!tables.sections.some(row => row.id === value.section_id) || !tables.assets.some(row => row.id === value.asset_id && row.processing_status === "ready"))) return result(null, { code: "23503" });
        if (this.entity === "sections" && !tables.archives.some(row => row.id === value.archive_id)) return result(null, { code: "23503" });
        source.push(value); selected = [value];
      }
      if (this.mode === "update") for (const row of selected) Object.assign(row, this.value, { updated_at: new Date().toISOString() });
      if (this.mode === "delete") {
        tables[this.entity] = source.filter(row => !selected.includes(row));
        if (this.entity === "books") {
          const archives = tables.archives.filter(row => selected.some(book => book.id === row.book_id));
          const sections = tables.sections.filter(row => archives.some(archive => archive.id === row.archive_id));
          tables.archives = tables.archives.filter(row => !archives.includes(row)); tables.sections = tables.sections.filter(row => !sections.includes(row));
          tables.photos = tables.photos.filter(row => !sections.some(section => section.id === row.section_id));
        }
        if (this.entity === "sections") tables.photos = tables.photos.filter(row => !selected.some(section => section.id === row.section_id));
      }
      const count = selected.length;
      selected.sort((left, right) => {
        for (const [key, ascending] of this.orders) {
          const comparison = typeof left[key] === "number" ? left[key] - right[key] : String(left[key]).localeCompare(String(right[key]));
          if (comparison) return ascending ? comparison : -comparison;
        }
        return 0;
      });
      const page = selected.slice(this.offset, this.end + 1).map(row => ({ ...row }));
      state.maxReturned = Math.max(state.maxReturned, page.length);
      return result(page, null, count);
    }
  }
  const db = {
    from: entity => new Query(entity),
    auth: {
      getUser: async () => state.role === "anonymous" ? { data: { user: null }, error: { status: 401 } } : { data: { user: { id: "existing-admin", email: "offline@example.invalid" } }, error: null },
      signInWithPassword: async () => { if (!state.loginError) state.role = "admin"; return { error: state.loginError }; },
      signOut: async () => { state.signOuts++; state.role = "anonymous"; return { error: null }; },
    },
    rpc: async (name, values = {}) => {
      calls.push({ rpc: name, values });
      if (name === "is_archive_admin") return result(state.role === "admin");
      if (state.role !== "admin") return result(null, { code: "42501" });
      if (name === "create_archive_book") {
        if (tables.books.some(row => row.slug === values.payload.slug)) return result(null, { code: "23505" });
        const id = randomUUID(); tables.books.push(bookDatabaseDefaults({ ...values.payload, id, status: "draft" }));
        tables.archives.push({ id: randomUUID(), book_id: id, status: "draft", title: values.payload.title, description: values.payload.committee_name }); return result(id);
      }
      if (name === "set_book_status") {
        const book = tables.books.find(row => row.id === values.book_id); if (!book) return result(null, { code: "PGRST116" });
        book.status = values.new_status; tables.archives.filter(row => row.book_id === book.id).forEach(row => { row.status = values.new_status; }); return result(null);
      }
      if (name === "move_archive_item") {
        const source = tables[values.entity]; const item = source.find(row => row.id === values.item_id);
        const parent = values.entity === "sections" ? "archive_id" : values.entity === "photos" ? "section_id" : null;
        const scoped = source.filter(row => !parent || row[parent] === item?.[parent]).sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id));
        if (!item || (values.before_id && !scoped.some(row => row.id === values.before_id))) return result(null, { code: "INVALID_SCOPE" });
        const ordered = scoped.filter(row => row.id !== item.id); ordered.splice(values.before_id ? ordered.findIndex(row => row.id === values.before_id) : ordered.length, 0, item);
        ordered.forEach((row, index) => { row.sort_order = (index + 1) * 10; }); return result(null);
      }
      throw new Error(`Unexpected fake RPC: ${name}`);
    },
    storage: { from: bucket => ({
      upload: async (key, bytes, options) => {
        calls.push({ upload: key, bucket, options });
        if (state.failStorage?.(key)) return { error: { statusCode: "503", message: "offline test transfer failure" } };
        if (objects.has(key)) return { error: { statusCode: "409", message: "already exists" } };
        objects.set(key, Buffer.from(bytes)); return { error: null };
      },
      download: async key => objects.has(key) ? { data: new Blob([objects.get(key)]), error: null } : { data: null, error: { message: "missing" } },
    }) },
  };
  return { db, tables, objects, state, calls };
}
