import { NextResponse } from 'next/server';
import path from 'path';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const bucket = formData.get('bucket') || 'food-images';

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Sanitize and generate unique filename
    const originalName = file.name || 'image.jpg';
    const cleanName = originalName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const fileName = `item_${Date.now()}_${cleanName}`;
    const contentType = file.type || 'image/jpeg';

    const supabase = createAdminClient();

    if (supabase) {
      // 1. Ensure bucket exists
      try {
        await supabase.storage.createBucket(bucket, { public: true });
      } catch (e) {
        // bucket might already exist
      }

      // 2. Upload file to Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(fileName, buffer, {
          contentType,
          upsert: true,
        });

      if (uploadError) {
        console.error('Supabase storage upload error:', uploadError);
        return NextResponse.json({ error: uploadError.message }, { status: 500 });
      }

      // 3. Get Public URL
      const { data: pubData } = supabase.storage.from(bucket).getPublicUrl(fileName);
      const publicUrl = pubData?.publicUrl;

      return NextResponse.json({
        success: true,
        url: publicUrl,
        fileName,
        storage: 'supabase',
      });
    }

    return NextResponse.json({ error: 'Storage client not available' }, { status: 500 });
  } catch (err) {
    console.error('Error in /api/upload:', err);
    return NextResponse.json({ error: err.message || 'File upload failed' }, { status: 500 });
  }
}
