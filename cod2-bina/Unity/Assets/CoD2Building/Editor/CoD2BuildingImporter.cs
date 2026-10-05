using UnityEditor;
using UnityEngine;

/// <summary>
/// Import settings for the CoD2 Normandy house: mesh colliders on every submesh,
/// repeating textures, and materials wired to Models/Textures/&lt;material&gt;.png
/// for both the Built-in (Standard) and URP (Lit) pipelines.
/// </summary>
public class CoD2BuildingImporter : AssetPostprocessor
{
    const string Root = "Assets/CoD2Building/";
    const string TextureDir = Root + "Models/Textures/";

    void OnPreprocessModel()
    {
        if (!assetPath.StartsWith(Root)) return;
        var importer = (ModelImporter)assetImporter;
        importer.addCollider = true;
        importer.globalScale = 1f;
        importer.importCameras = false;
        importer.importLights = false;
        importer.importAnimation = false;
        importer.animationType = ModelImporterAnimationType.None;
    }

    void OnPreprocessTexture()
    {
        if (!assetPath.StartsWith(TextureDir)) return;
        var importer = (TextureImporter)assetImporter;
        importer.wrapMode = TextureWrapMode.Repeat;
        importer.mipmapEnabled = true;
        importer.anisoLevel = 8;
        importer.sRGBTexture = true;
    }

    void OnPostprocessMaterial(Material material)
    {
        if (!assetPath.StartsWith(Root)) return;
        var texture = AssetDatabase.LoadAssetAtPath<Texture2D>(TextureDir + material.name + ".png");
        if (texture == null) return;

        if (material.HasProperty("_BaseMap")) material.SetTexture("_BaseMap", texture);
        if (material.HasProperty("_MainTex")) material.SetTexture("_MainTex", texture);
        if (material.HasProperty("_BaseColor")) material.SetColor("_BaseColor", Color.white);
        if (material.HasProperty("_Color")) material.SetColor("_Color", Color.white);
        if (material.HasProperty("_Smoothness")) material.SetFloat("_Smoothness", 0.08f);
        if (material.HasProperty("_Glossiness")) material.SetFloat("_Glossiness", 0.08f);
        if (material.HasProperty("_Metallic")) material.SetFloat("_Metallic", 0f);
    }

    [MenuItem("Tools/CoD2/Normandiya Evini Sahneye Ekle")]
    static void PlaceHouse()
    {
        var model = AssetDatabase.LoadAssetAtPath<GameObject>(Root + "Models/normandy_house.obj");
        if (model == null)
        {
            Debug.LogError("normandy_house.obj bulunamadi: " + Root + "Models/");
            return;
        }
        var house = (GameObject)PrefabUtility.InstantiatePrefab(model);
        house.name = "NormandyHouse";
        foreach (var t in house.GetComponentsInChildren<Transform>())
            GameObjectUtility.SetStaticEditorFlags(t.gameObject,
                StaticEditorFlags.BatchingStatic | StaticEditorFlags.OccluderStatic |
                StaticEditorFlags.OccludeeStatic | StaticEditorFlags.ContributeGI |
                StaticEditorFlags.ReflectionProbeStatic);
        Undo.RegisterCreatedObjectUndo(house, "Place Normandy House");
        Selection.activeGameObject = house;
    }
}
