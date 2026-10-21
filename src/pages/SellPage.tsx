import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { ErrorMessage, fieldError, PlusIcon, SelectField, TextArea, TextField } from "../components/ui";
import { api, ApiError, call, imageUrl, newId, uploadPhoto, type Lot } from "../lib/api";
import { formatMoney } from "../lib/format";
import { useAsync, useCommand } from "../lib/hooks";
import { useSite } from "../site";

const MAX_PHOTOS = 10;
const MAX_BYTES = 5 * 1024 * 1024;
const TYPES = ["image/jpeg", "image/png", "image/webp"];

/** "2026-10-22T18:00" for an <input type="datetime-local"> in the visitor's time zone. */
export function toLocalInput(date: Date): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

/** List a new lot (/sell) or change one (/lots/:id/edit). */
export function SellPage() {
  const { id } = useParams();
  const { signedIn, signIn } = useSite();
  const selling = useAsync(() => (signedIn ? call(api().GET("/api/v1/me/selling")) : Promise.resolve(null)), [signedIn]);
  const lot = useAsync(() => (id && signedIn ? call(api().GET("/api/v1/lots/{id}", { params: { path: { id } } })) : Promise.resolve(null)), [id, signedIn]);

  if (!signedIn) {
    return (
      <div className="page narrow">
        <h1>Sell a lot</h1>
        <p>Sign in to list a lot at this auction house.</p>
        <button type="button" className="button button-dark" onClick={signIn}>
          Sign in
        </button>
      </div>
    );
  }

  if ((id && !lot.data) || !selling.data) {
    return (
      <div className="page">
        <ErrorMessage error={lot.error ?? selling.error} />
        <p className="muted">Loading…</p>
      </div>
    );
  }

  if (!id && !selling.data.canSell) {
    return (
      <div className="page narrow" data-testid="not-a-seller">
        <h1>Sell a lot</h1>
        <p>This auction house lets approved sellers list lots. Ask them to approve you, then come back here.</p>
      </div>
    );
  }

  if (lot.data && !lot.data.youAreSeller) {
    return (
      <div className="page narrow">
        <h1>Not your lot</h1>
        <p>
          Only its seller can change it. <Link to={`/lots/${lot.data.id}`}>See the lot</Link>
        </p>
      </div>
    );
  }

  return <LotForm key={id ?? "new"} existing={lot.data ?? null} onPhotosChanged={lot.reload} />;
}

interface Photo {
  key: string;
  /** Already on the lot. */
  imageId?: string;
  /** Chosen, not uploaded yet (a new lot uploads after it is listed). */
  file?: File;
  preview: string;
}

function LotForm({ existing, onPhotosChanged }: { existing: Lot | null; onPhotosChanged: () => void }) {
  const { house, categories } = useSite();
  const navigate = useNavigate();
  const command = useCommand();
  const locked = existing !== null && existing.bidCount > 0;
  const [opened] = useState(() => new Date());
  const [title, setTitle] = useState(existing?.title ?? "");
  const [categoryId, setCategoryId] = useState(existing?.categoryId ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [startingPrice, setStartingPrice] = useState(existing ? String(existing.startingPrice) : "");
  const [increment, setIncrement] = useState(existing ? String(existing.minimumIncrement) : "10");
  const [reserve, setReserve] = useState(existing?.yourReservePrice != null ? String(existing.yourReservePrice) : "");
  const [startsAt, setStartsAt] = useState(toLocalInput(existing ? new Date(existing.startsAt) : opened));
  // A new lot runs a week by default.
  const [endsAt, setEndsAt] = useState(toLocalInput(existing ? new Date(existing.endsAt) : new Date(opened.getTime() + 7 * 24 * 3600_000)));
  const [photos, setPhotos] = useState<Photo[]>(() => (existing ? existing.imageIds.map((imageId) => ({ key: imageId, imageId, preview: imageUrl(existing.id, imageId) })) : []));
  const [photoError, setPhotoError] = useState<string>();
  const [uploading, setUploading] = useState(false);

  useEffect(
    () => () => photos.forEach((p) => p.file && URL.revokeObjectURL(p.preview)),
    // Only on leaving: object URLs of photos still shown stay valid.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const choose = async (files: FileList | null) => {
    setPhotoError(undefined);
    const chosen = [...(files ?? [])];
    const room = MAX_PHOTOS - photos.length;
    const bad = chosen.find((f) => !TYPES.includes(f.type) || f.size > MAX_BYTES);
    if (bad) setPhotoError(`${bad.name}: use JPEG, PNG or WebP photos of at most 5 MB.`);
    const good = chosen.filter((f) => TYPES.includes(f.type) && f.size <= MAX_BYTES).slice(0, room);
    if (chosen.length > room) setPhotoError(`A lot can have at most ${MAX_PHOTOS} photos.`);
    const added = good.map((file) => ({ key: newId(), file, preview: URL.createObjectURL(file) }));
    if (!existing) {
      setPhotos((current) => [...current, ...added]);
      return;
    }

    // An existing lot changes right away.
    setUploading(true);
    try {
      for (const photo of added) {
        const imageId = newId();
        await uploadPhoto(existing.id, imageId, photo.file);
        setPhotos((current) => [...current, { key: imageId, imageId, preview: imageUrl(existing.id, imageId) }]);
      }

      onPhotosChanged();
    } catch (e) {
      setPhotoError(e instanceof Error ? e.message : "The photo could not be uploaded.");
    } finally {
      setUploading(false);
    }
  };

  const remove = async (photo: Photo) => {
    setPhotoError(undefined);
    if (existing && photo.imageId) {
      try {
        await call(api().DELETE("/api/v1/lots/{id}/images/{imageId}", { params: { path: { id: existing.id, imageId: photo.imageId } } }));
        onPhotosChanged();
      } catch (e) {
        setPhotoError(e instanceof Error ? e.message : "The photo could not be removed.");
        return;
      }
    }

    if (photo.file) URL.revokeObjectURL(photo.preview);
    setPhotos((current) => current.filter((p) => p.key !== photo.key));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const body = {
      title,
      description,
      startingPrice: Number(startingPrice.replace(",", ".")),
      minimumIncrement: Number(increment.replace(",", ".")),
      reservePrice: reserve.trim() ? Number(reserve.replace(",", ".")) : null,
      // Unchanged times go back exactly as read: the inputs drop seconds, and a lot with bids must not "change" them.
      startsAt: existing && startsAt === toLocalInput(new Date(existing.startsAt)) ? existing.startsAt : new Date(startsAt).toISOString(),
      endsAt: existing && endsAt === toLocalInput(new Date(existing.endsAt)) ? existing.endsAt : new Date(endsAt).toISOString(),
      // An empty id takes the lot out of its category (the API keeps it when the field is left out).
      categoryId: categoryId || "00000000-0000-0000-0000-000000000000",
    };
    const ok = await command.run(async () => {
      if (existing) {
        await call(api().PUT("/api/v1/lots/{id}", { params: { path: { id: existing.id } }, body }));
        navigate(`/lots/${existing.id}`);
        return;
      }

      const id = newId();
      await call(api().POST("/api/v1/lots", { body: { id, ...body, categoryId: categoryId || null } }));
      setUploading(true);
      try {
        for (const photo of photos) if (photo.file) await uploadPhoto(id, newId(), photo.file);
      } finally {
        setUploading(false);
      }

      navigate(`/lots/${id}`);
    });
    if (!ok) window.scrollTo({ top: 0 });
  };

  const field = (name: string) => fieldError(command.error, name);
  const validationNames = ["title", "description", "startingPrice", "minimumIncrement", "reservePrice", "startsAt", "endsAt", "categoryId"];
  const domainError = command.error instanceof ApiError && command.error.status === 422 ? command.error : null;

  return (
    <div className="page">
      <nav aria-label="Breadcrumb" className="breadcrumb">
        <Link to="/my/lots">My lots</Link>
      </nav>
      <h1 style={{ margin: "0 0 6px", fontSize: 30 }}>{existing ? `Edit lot ${existing.number}` : "Sell a lot"}</h1>
      <p className="muted" style={{ margin: "0 0 28px", maxWidth: "70ch" }}>
        {locked
          ? "This lot has bids: prices, reserve and times are fixed now. You can still change the title, description, category and photos."
          : "Your lot appears on the site when bidding opens. Until the first bid you can change everything."}
      </p>
      <div className="sell-layout">
        <form className="form sell-form" onSubmit={submit} noValidate>
          {domainError && (
            <p className="alert alert-error" role="alert">
              {domainError.message}
            </p>
          )}
          {!domainError && <ErrorMessage error={command.error} fields={validationNames} />}

          <fieldset>
            <legend>Photos</legend>
            <p className="hint" style={{ margin: 0 }}>
              Up to {MAX_PHOTOS} photos, JPEG, PNG or WebP, 5 MB each. The first one is the cover.
            </p>
            <ul className="photo-grid">
              {photos.map((photo, i) => (
                <li key={photo.key}>
                  <div className="photo-tile">
                    <img src={photo.preview} alt={`Photo ${i + 1}`} />
                    {i === 0 && <span className="badge">Cover</span>}
                  </div>
                  <button type="button" className="button button-small" onClick={() => remove(photo)}>
                    Remove photo {i + 1}
                  </button>
                </li>
              ))}
              {photos.length < MAX_PHOTOS && (
                <li>
                  <label className="photo-add">
                    <PlusIcon />
                    {uploading ? "Uploading…" : "Add photos"}
                    <input className="visually-hidden" type="file" accept={TYPES.join(",")} multiple onChange={(e) => void choose(e.target.files)} disabled={uploading} />
                  </label>
                </li>
              )}
            </ul>
            {photoError && (
              <p className="field-error" role="alert">
                {photoError}
              </p>
            )}
          </fieldset>

          <fieldset>
            <legend>Description</legend>
            <TextField label="Title" required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} error={field("title")} />
            {categories.length > 0 && (
              <SelectField label="Category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} error={field("categoryId")}>
                <option value="">No category</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </SelectField>
            )}
            <TextArea label="Description" rows={6} maxLength={4000} value={description} onChange={(e) => setDescription(e.target.value)} error={field("description")} />
          </fieldset>

          <fieldset disabled={locked}>
            <legend>Price</legend>
            <div className="form-row">
              <TextField label={`Starting price (${house.currency})`} inputMode="decimal" required value={startingPrice} onChange={(e) => setStartingPrice(e.target.value)} error={field("startingPrice")} />
              <TextField label={`Minimum increment (${house.currency})`} inputMode="decimal" required value={increment} onChange={(e) => setIncrement(e.target.value)} error={field("minimumIncrement")} />
              <TextField
                label={`Reserve price (${house.currency}, optional)`}
                inputMode="decimal"
                value={reserve}
                onChange={(e) => setReserve(e.target.value)}
                hint="Hidden from bidders. They only see whether it is met."
                error={field("reservePrice")}
              />
            </div>
          </fieldset>

          <fieldset disabled={locked}>
            <legend>When</legend>
            <div className="form-row">
              <TextField label="Bidding opens" type="datetime-local" required value={startsAt} onChange={(e) => setStartsAt(e.target.value)} hint="A time in the past opens it now." error={field("startsAt")} />
              <TextField label="Bidding ends" type="datetime-local" required value={endsAt} onChange={(e) => setEndsAt(e.target.value)} hint="A bid in the last 2 minutes extends it by 2 minutes." error={field("endsAt")} />
            </div>
          </fieldset>

          <div className="actions" style={{ paddingTop: 8, borderTop: "1px solid var(--line)" }}>
            <button type="submit" className="button button-accent button-large" disabled={command.pending || uploading}>
              {existing ? "Save changes" : "List the lot"}
            </button>
            <Link to={existing ? `/lots/${existing.id}` : "/my/lots"} className="button">
              Cancel
            </Link>
          </div>
        </form>

        <aside aria-label="Preview" className="sell-aside">
          <h2 className="small muted" style={{ textTransform: "uppercase", letterSpacing: "0.06em", margin: 0 }}>
            How buyers see it
          </h2>
          <div className="panel" style={{ gap: 8 }}>
            <div className="lot-card-photo">{photos[0] ? <img src={photos[0].preview} alt="" /> : null}</div>
            <span className="small muted">{categories.find((c) => c.id === categoryId)?.name ?? "No category"}</span>
            <strong style={{ fontSize: 16 }}>{title || "Your title"}</strong>
            <div className="lot-card-numbers">
              <div>
                <div className="small muted">Starting price</div>
                <div className="price">{startingPrice ? formatMoney(Number(startingPrice.replace(",", ".")) || 0, house.currency) : "—"}</div>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
