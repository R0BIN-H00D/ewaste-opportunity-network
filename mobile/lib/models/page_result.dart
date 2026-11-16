/// One page of a paged answer, with the server's page counts.
class PageResult<T> {
  const PageResult({required this.items, required this.page, required this.pages, required this.total});

  final List<T> items;
  final int page;
  final int pages;
  final int total;
}
