import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { ApiError, type ApiResult } from "./api";
import { processBatch, uniqueNames, zipResults, type ItemState } from "./batch";

const files = ["a.jpg", "b.jpg", "c.jpg"].map((name) => new File([name], name, { type: "image/jpeg" }));

function result(filename: string): ApiResult {
  return { blob: new Blob([`out:${filename}`], { type: "image/png" }), filename, type: "image/png" };
}

function recorder() {
  const updates: [number, ItemState["status"]][] = [];
  const states = new Map<number, ItemState>();
  return {
    updates,
    states,
    onUpdate: (index: number, state: ItemState) => {
      updates.push([index, state.status]);
      states.set(index, state);
    },
  };
}

const live = () => new AbortController().signal;

describe("processBatch", () => {
  it("runs one image at a time, in order", async () => {
    let inFlight = 0;
    let most = 0;
    const order: string[] = [];
    const { updates, onUpdate } = recorder();
    await processBatch(
      files,
      [0, 1, 2],
      async (file, { onProgress }) => {
        inFlight += 1;
        most = Math.max(most, inFlight);
        order.push(file.name);
        onProgress({ phase: "processing" });
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight -= 1;
        return result(file.name);
      },
      { signal: live(), onUpdate },
    );
    expect(most).toBe(1);
    expect(order).toEqual(["a.jpg", "b.jpg", "c.jpg"]);
    expect(updates).toEqual([
      [0, "running"],
      [0, "running"],
      [0, "done"],
      [1, "running"],
      [1, "running"],
      [1, "done"],
      [2, "running"],
      [2, "running"],
      [2, "done"],
    ]);
  });

  it("carries on after a failure", async () => {
    const { states, onUpdate } = recorder();
    await processBatch(
      files,
      [0, 1, 2],
      async (file) => {
        if (file.name === "b.jpg") throw new ApiError("invalid_image", "That image couldn't be read.", 400);
        return result(file.name);
      },
      { signal: live(), onUpdate },
    );
    expect([...states.values()].map((state) => state.status)).toEqual(["done", "error", "done"]);
    const failed = states.get(1) as Extract<ItemState, { status: "error" }>;
    expect([failed.error.code, failed.error.message]).toEqual(["invalid_image", "That image couldn't be read."]);
  });

  it("turns unexpected errors into ApiErrors", async () => {
    const { states, onUpdate } = recorder();
    await processBatch(files, [0], async () => Promise.reject(new Error("boom")), { signal: live(), onUpdate });
    const failed = states.get(0) as Extract<ItemState, { status: "error" }>;
    expect(failed.error).toBeInstanceOf(ApiError);
    expect(failed.error.code).toBe("bad_response");
  });

  it("skips the rest once cancelled", async () => {
    const controller = new AbortController();
    const { states, onUpdate } = recorder();
    let calls = 0;
    await processBatch(
      files,
      [0, 1, 2],
      async (_file, { signal }) => {
        calls += 1;
        controller.abort(); // the user presses Cancel while the first is running
        if (signal.aborted) throw new ApiError("aborted", "Cancelled.");
        return result("never");
      },
      { signal: controller.signal, onUpdate },
    );
    expect(calls).toBe(1);
    expect([...states.values()].map((state) => state.status)).toEqual(["skipped", "skipped", "skipped"]);
  });

  it("runs only the given images (Try failed again)", async () => {
    const order: string[] = [];
    await processBatch(
      files,
      [2],
      async (file) => {
        order.push(file.name);
        return result(file.name);
      },
      { signal: live(), onUpdate: () => {} },
    );
    expect(order).toEqual(["c.jpg"]);
  });
});

describe("uniqueNames", () => {
  it("numbers repeats, ignoring case", () => {
    expect(uniqueNames(["a.jpg", "a.jpg", "A.JPG", "b.png", "a (2).jpg"])).toEqual([
      "a.jpg",
      "a (2).jpg",
      "A (3).JPG",
      "b.png",
      "a (2) (2).jpg",
    ]);
  });

  it("handles names without an extension", () => {
    expect(uniqueNames(["README", "README", ".env", ".env"])).toEqual(["README", "README (2)", ".env", ".env (2)"]);
  });
});

describe("zipResults", () => {
  it("zips every result under a unique name", async () => {
    const zip = await zipResults([result("pic-1080x1080.jpg"), result("pic-1080x1080.jpg"), result("other.webp")]);
    expect(zip.type).toBe("application/zip");
    const unpacked = await JSZip.loadAsync(await zip.arrayBuffer());
    expect(Object.keys(unpacked.files).sort()).toEqual(["other.webp", "pic-1080x1080 (2).jpg", "pic-1080x1080.jpg"]);
    expect(await unpacked.file("pic-1080x1080 (2).jpg")!.async("string")).toBe("out:pic-1080x1080.jpg");
  });
});
