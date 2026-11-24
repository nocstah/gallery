import 'package:flutter/material.dart';
import 'package:immich_mobile/gallery/theme/kioku_tokens.dart';

class ImmichTitleText extends StatelessWidget {
  final double fontSize;

  const ImmichTitleText({super.key, this.fontSize = 48});

  @override
  Widget build(BuildContext context) {
    return Text(
      'Noodle Gallery',
      textAlign: TextAlign.center,
      style: context.kioku.displayStyle(size: fontSize * 0.72, weight: FontWeight.w800),
    );
  }
}
