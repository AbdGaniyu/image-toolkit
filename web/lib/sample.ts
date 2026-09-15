/** The design's sample photo (public/sample.jpg), as if the user had picked it. */
export async function sampleFile(): Promise<File> {
  const response = await fetch("/sample.jpg");
  if (!response.ok) throw new Error(`sample photo: HTTP ${response.status}`);
  return new File([await response.blob()], "dunes.jpg", { type: "image/jpeg" });
}
