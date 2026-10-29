type NamedStream = { id: string; name?: string };

export function availableStreamName(streams: readonly NamedStream[]) {
  const used = new Set(streams.map((stream) => stream.name?.toLowerCase()));
  let number = 1;
  while (used.has(`stream ${number}`)) number++;
  return `Stream ${number}`;
}

/** Fill legacy names and repair duplicate default labels without changing IDs. */
export function nameStreams<T extends NamedStream>(streams: readonly T[]): T[] {
  const numbered = /^Stream \d+$/i;
  const defaults = streams.filter((stream) => numbered.test(stream.name ?? ""));
  const repair =
    new Set(defaults.map((stream) => stream.name!.toLowerCase())).size !==
    defaults.length;
  const used = new Set(
    streams
      .filter(
        (stream) => stream.name && !(repair && numbered.test(stream.name)),
      )
      .map((stream) => stream.name!.toLowerCase()),
  );
  let number = 1;
  return streams.map((stream) => {
    if (stream.name && !(repair && numbered.test(stream.name))) return stream;
    while (used.has(`stream ${number}`)) number++;
    const name = `Stream ${number++}`;
    used.add(name.toLowerCase());
    return { ...stream, name };
  });
}
